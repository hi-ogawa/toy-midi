//! Grid-guided monophonic bass transcription core.
//!
//! Port of `tools/bass-pitch.py`. The pipeline takes plain mono samples plus a
//! params struct so a future wasm wrapper can reuse it unchanged. Feature
//! extraction approximates librosa behaviorally rather than numerically, so
//! thresholds tuned against the Python harness must be re-swept, as recorded
//! in `docs/bass-pitch-evaluation.md`.

use std::collections::{BTreeMap, HashMap};
use std::f64::consts::PI;

use pyin::{Framing, PYINExecutor, PadMode};
use realfft::RealFftPlanner;

pub const TICKS_PER_BEAT: u16 = 480;

#[derive(Clone, Debug, serde::Deserialize)]
pub struct Params {
    pub start: f64,
    pub offset: f64,
    pub bpm: f64,
    pub cells_per_beat: u32,
    pub grid_origin: f64,
    pub activity_off_db: f64,
    pub activity_on_db: f64,
    pub activity_pitch: i32,
    pub fmin: f64,
    pub fmax: f64,
    pub voicing_threshold: f64,
    pub min_voiced_coverage: f64,
    pub boundary_onset_threshold: f64,
    pub boundary_tolerance: f64,
    pub sample_rate: u32,
    pub frame_length: usize,
    pub hop_length: usize,
}

/// Per-frame analysis features. Times are in source seconds.
pub struct Frames {
    pub times: Vec<f64>,
    pub f0: Vec<f64>,
    pub midi_pitch: Vec<f64>,
    pub voiced_flag: Vec<bool>,
    pub voiced_probability: Vec<f64>,
    pub onset: Vec<f64>,
    pub rms: Vec<f64>,
}

#[derive(Clone, Debug)]
pub struct GridCell {
    pub index: i64,
    pub source_start: f64,
    pub source_end: f64,
    pub project_start: f64,
    pub project_end: f64,
    pub pitch: Option<i32>,
    pub voiced_coverage: f64,
    pub vote_confidence: f64,
    pub frame_count: usize,
    pub voiced_frame_count: usize,
}

#[derive(Clone, Debug)]
pub struct ActivityCell {
    pub index: i64,
    pub source_start: f64,
    pub source_end: f64,
    pub project_start: f64,
    pub project_end: f64,
    pub rms: f64,
    pub rms_db: f64,
    pub active: bool,
}

#[derive(Clone, Debug)]
pub struct Boundary {
    pub left_cell: i64,
    pub right_cell: i64,
    pub source_time: f64,
    pub project_time: f64,
    pub onset_score: f64,
    pub rms_dip_score: f64,
    pub confidence_dip_score: f64,
    pub evidence_score: f64,
    pub split: bool,
    pub reason: &'static str,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct Note {
    pub pitch: i32,
    pub project_start: f64,
    pub project_end: f64,
    pub first_cell: i64,
    pub last_cell: i64,
}

#[derive(Clone, Debug)]
pub struct PitchDecision {
    pub note: Note,
    pub evidence_frames: usize,
    pub winner_weight: f64,
    pub runner_up_pitch: Option<i32>,
    pub runner_up_weight: f64,
    pub margin: f64,
}

pub struct Pipeline {
    pub frames: Frames,
    pub cells: Vec<GridCell>,
    pub activity_cells: Vec<ActivityCell>,
    pub boundaries: Vec<Boundary>,
    pub legacy_notes: Vec<Note>,
    pub activity_notes: Vec<Note>,
    pub onset_notes: Vec<Note>,
    pub pitch_decisions: Vec<PitchDecision>,
}

pub fn run_pipeline(audio: &[f32], params: &Params) -> Pipeline {
    let frames = analyze(audio, params);
    let excerpt_end = params.start + audio.len() as f64 / params.sample_rate as f64;
    let mut cells = make_grid_cells(params, excerpt_end);
    let activity_cells = detect_activity(&cells, &frames, params);
    for cell in &mut cells {
        vote_cell(cell, &frames, params);
    }
    let boundaries = evaluate_boundaries(&cells, &frames, params);
    let legacy_notes = merge_cells(&cells, &boundaries);
    let activity_notes = make_activity_notes(&activity_cells, params.activity_pitch);
    let onset_notes = make_activity_onset_notes(&cells, &activity_cells, &frames, params);
    let pitch_decisions = assign_region_pitches(&onset_notes, &frames, params);
    Pipeline {
        frames,
        cells,
        activity_cells,
        boundaries,
        legacy_notes,
        activity_notes,
        onset_notes,
        pitch_decisions,
    }
}

pub fn analyze(audio: &[f32], params: &Params) -> Frames {
    let audio: Vec<f64> = audio.iter().map(|&sample| sample as f64).collect();
    let mut executor = PYINExecutor::<f64>::new(
        params.fmin,
        params.fmax,
        params.sample_rate,
        params.frame_length,
        None,
        Some(params.hop_length),
        None,
    );
    let (_timestamps, f0, voiced_flag, voiced_probability) =
        executor.pyin(&audio, f64::NAN, Framing::Center(PadMode::Constant(0.)));
    let onset = onset_strength(
        &audio,
        params.frame_length,
        params.hop_length,
        params.sample_rate,
    );
    let rms = rms_frames(&audio, params.frame_length, params.hop_length);

    let count = f0.len().min(onset.len()).min(rms.len());
    let f0: Vec<f64> = f0.iter().take(count).copied().collect();
    Frames {
        times: (0..count)
            .map(|i| params.start + (i * params.hop_length) as f64 / params.sample_rate as f64)
            .collect(),
        midi_pitch: f0.iter().map(|&hz| hz_to_midi(hz)).collect(),
        f0,
        voiced_flag: voiced_flag.iter().take(count).copied().collect(),
        voiced_probability: voiced_probability.iter().take(count).copied().collect(),
        onset: normalize_feature(&onset[..count]),
        rms: rms[..count].to_vec(),
    }
}

/// Mel-banded log-power spectral flux as an onset novelty signal, following
/// the shape of librosa's `onset_strength` without exact mel filter weights.
/// Banding before the rectified diff is load-bearing: per-bin jitter on decay
/// tails cancels inside a band, while rectifying per-bin differences turns
/// that jitter into spurious flux peaks on decaying notes.
fn onset_strength(
    audio: &[f64],
    frame_length: usize,
    hop_length: usize,
    sample_rate: u32,
) -> Vec<f64> {
    const N_BANDS: usize = 128;
    const AMIN: f64 = 1e-10;
    const TOP_DB: f64 = 80.0;
    let n_frames = audio.len() / hop_length + 1;
    let n_bins = frame_length / 2 + 1;
    let window: Vec<f64> = (0..frame_length)
        .map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / frame_length as f64).cos())
        .collect();
    let mel = |hz: f64| 2595.0 * (1.0 + hz / 700.0).log10();
    let mel_max = mel(sample_rate as f64 / 2.0);
    let band_of_bin: Vec<usize> = (0..n_bins)
        .map(|bin| {
            let hz = bin as f64 * sample_rate as f64 / frame_length as f64;
            (((mel(hz) / mel_max) * N_BANDS as f64) as usize).min(N_BANDS - 1)
        })
        .collect();

    let fft = RealFftPlanner::<f64>::new().plan_fft_forward(frame_length);
    let mut input = fft.make_input_vec();
    let mut spectrum = fft.make_output_vec();
    let mut band_db: Vec<Vec<f64>> = Vec::with_capacity(n_frames);
    for frame in 0..n_frames {
        let frame_start = (frame * hop_length) as isize - (frame_length / 2) as isize;
        for (i, sample) in input.iter_mut().enumerate() {
            let index = frame_start + i as isize;
            *sample = if index >= 0 && (index as usize) < audio.len() {
                audio[index as usize] * window[i]
            } else {
                0.0
            };
        }
        fft.process(&mut input, &mut spectrum).expect("fft process");
        let mut bands = vec![0.0f64; N_BANDS];
        for (bin, value) in spectrum.iter().enumerate() {
            bands[band_of_bin[bin]] += value.norm_sqr();
        }
        band_db.push(
            bands
                .iter()
                .map(|power| 10.0 * power.max(AMIN).log10())
                .collect(),
        );
    }
    let peak_db = band_db
        .iter()
        .flatten()
        .copied()
        .fold(f64::NEG_INFINITY, f64::max);
    let floor_db = peak_db - TOP_DB;
    for bands in &mut band_db {
        for value in bands {
            *value = value.max(floor_db);
        }
    }
    let mut flux = Vec::with_capacity(n_frames);
    flux.push(0.0);
    for frame in 1..n_frames {
        let value = band_db[frame]
            .iter()
            .zip(&band_db[frame - 1])
            .map(|(now, before)| (now - before).max(0.0))
            .sum::<f64>()
            / N_BANDS as f64;
        flux.push(value);
    }
    // On synthetic steady tones the off-attack flux is pure FFT rounding
    // noise, which is still positive and would capture the percentile
    // normalization scale. Zero anything far below the peak.
    let peak = flux.iter().copied().fold(0.0, f64::max);
    for value in &mut flux {
        if *value < peak * 1e-6 {
            *value = 0.0;
        }
    }
    // Like librosa's center=True onset envelope, delay by half a window so
    // the peak lands at the perceived attack instead of half a window early.
    let shift = frame_length / (2 * hop_length);
    let mut shifted = vec![0.0; shift.min(n_frames)];
    shifted.extend_from_slice(&flux[..n_frames - shifted.len()]);
    shifted
}

fn rms_frames(audio: &[f64], frame_length: usize, hop_length: usize) -> Vec<f64> {
    let n_frames = audio.len() / hop_length + 1;
    (0..n_frames)
        .map(|frame| {
            let frame_start = (frame * hop_length) as isize - (frame_length / 2) as isize;
            let sum: f64 = (0..frame_length)
                .map(|i| {
                    let index = frame_start + i as isize;
                    if index >= 0 && (index as usize) < audio.len() {
                        audio[index as usize].powi(2)
                    } else {
                        0.0
                    }
                })
                .sum();
            (sum / frame_length as f64).sqrt()
        })
        .collect()
}

fn hz_to_midi(hz: f64) -> f64 {
    12.0 * (hz / 440.0).log2() + 69.0
}

fn normalize_feature(values: &[f64]) -> Vec<f64> {
    let mut positive: Vec<f64> = values
        .iter()
        .copied()
        .filter(|value| value.is_finite() && *value > 0.0)
        .collect();
    if positive.is_empty() {
        return vec![0.0; values.len()];
    }
    positive.sort_by(f64::total_cmp);
    let rank = 0.95 * (positive.len() - 1) as f64;
    let low = positive[rank.floor() as usize];
    let high = positive[rank.ceil() as usize];
    let scale = low + (high - low) * rank.fract();
    values
        .iter()
        .map(|value| (value / scale).clamp(0.0, 1.0))
        .collect()
}

fn make_grid_cells(params: &Params, excerpt_end: f64) -> Vec<GridCell> {
    let cell_duration = 60.0 / params.bpm / params.cells_per_beat as f64;
    let source_origin = params.grid_origin - params.offset;
    let epsilon = 1e-9;
    let first_index = ((params.start - source_origin - epsilon) / cell_duration).ceil() as i64;
    let last_index = ((excerpt_end - source_origin + epsilon) / cell_duration).floor() as i64 - 1;
    (first_index..=last_index)
        .map(|index| GridCell {
            index,
            source_start: source_origin + index as f64 * cell_duration,
            source_end: source_origin + (index + 1) as f64 * cell_duration,
            project_start: params.grid_origin + index as f64 * cell_duration,
            project_end: params.grid_origin + (index + 1) as f64 * cell_duration,
            pitch: None,
            voiced_coverage: 0.0,
            vote_confidence: 0.0,
            frame_count: 0,
            voiced_frame_count: 0,
        })
        .collect()
}

fn detect_activity(cells: &[GridCell], frames: &Frames, params: &Params) -> Vec<ActivityCell> {
    let mut active = false;
    cells
        .iter()
        .map(|cell| {
            let mut in_cell: Vec<f64> = frames
                .times
                .iter()
                .zip(&frames.rms)
                .filter(|(&time, _)| time >= cell.source_start && time < cell.source_end)
                .map(|(_, &rms)| rms)
                .collect();
            in_cell.sort_by(f64::total_cmp);
            let rms = if in_cell.is_empty() {
                0.0
            } else if in_cell.len() % 2 == 1 {
                in_cell[in_cell.len() / 2]
            } else {
                (in_cell[in_cell.len() / 2 - 1] + in_cell[in_cell.len() / 2]) / 2.0
            };
            let rms_db = rms_to_db(rms);
            active = rms_db
                >= if active {
                    params.activity_off_db
                } else {
                    params.activity_on_db
                };
            ActivityCell {
                index: cell.index,
                source_start: cell.source_start,
                source_end: cell.source_end,
                project_start: cell.project_start,
                project_end: cell.project_end,
                rms,
                rms_db,
                active,
            }
        })
        .collect()
}

fn rms_to_db(value: f64) -> f64 {
    if value <= 0.0 {
        return f64::NEG_INFINITY;
    }
    20.0 * value.log10()
}

fn vote_cell(cell: &mut GridCell, frames: &Frames, params: &Params) {
    let mut frame_count = 0usize;
    let mut voiced: Vec<(f64, f64)> = Vec::new();
    for i in 0..frames.times.len() {
        let time = frames.times[i];
        if time < cell.source_start || time >= cell.source_end {
            continue;
        }
        frame_count += 1;
        if frames.voiced_flag[i]
            && frames.midi_pitch[i].is_finite()
            && frames.voiced_probability[i] >= params.voicing_threshold
        {
            voiced.push((frames.midi_pitch[i], frames.voiced_probability[i]));
        }
    }
    cell.frame_count = frame_count;
    cell.voiced_frame_count = voiced.len();
    cell.voiced_coverage = if frame_count > 0 {
        voiced.len() as f64 / frame_count as f64
    } else {
        0.0
    };
    if voiced.is_empty() || cell.voiced_coverage < params.min_voiced_coverage {
        return;
    }
    let weight_sum: f64 = voiced.iter().map(|(_, weight)| weight).sum();
    let weighted_mean = voiced
        .iter()
        .map(|(pitch, weight)| pitch * weight)
        .sum::<f64>()
        / weight_sum;
    let mut weight_by_pitch: BTreeMap<i32, f64> = BTreeMap::new();
    for (pitch, weight) in &voiced {
        *weight_by_pitch.entry(pitch.round() as i32).or_default() += weight;
    }
    // Tie-break order matches the Python tuple: weight, closeness to the
    // weighted mean, then lower pitch.
    let selected_pitch = weight_by_pitch
        .iter()
        .max_by(|a, b| {
            let key = |(&pitch, &weight): &(&i32, &f64)| {
                (weight, -((pitch as f64) - weighted_mean).abs(), -pitch)
            };
            key(a).partial_cmp(&key(b)).expect("finite vote keys")
        })
        .map(|(&pitch, _)| pitch)
        .expect("non-empty votes");
    let selected: Vec<f64> = voiced
        .iter()
        .filter(|(pitch, _)| pitch.round() as i32 == selected_pitch)
        .map(|(_, weight)| *weight)
        .collect();
    cell.vote_confidence = selected.iter().sum::<f64>() / selected.len() as f64;
    cell.pitch = Some(selected_pitch);
}

fn evaluate_boundaries(cells: &[GridCell], frames: &Frames, params: &Params) -> Vec<Boundary> {
    cells
        .windows(2)
        .map(|pair| {
            let (left, right) = (&pair[0], &pair[1]);
            let source_time = left.source_end;
            let mut onset_score = 0.0;
            let mut rms_dip_score = 0.0;
            let mut confidence_dip_score = 0.0;
            let mut evidence_score = 0.0;
            let (split, reason) = if left.pitch != right.pitch {
                let reason = if left.pitch.is_none() || right.pitch.is_none() {
                    "voiced-rest"
                } else {
                    "pitch-change"
                };
                (true, reason)
            } else if left.pitch.is_none() {
                (false, "rest")
            } else {
                onset_score = frames
                    .times
                    .iter()
                    .zip(&frames.onset)
                    .filter(|(&time, _)| (time - source_time).abs() <= params.boundary_tolerance)
                    .map(|(_, &onset)| onset)
                    .fold(0.0, f64::max);
                rms_dip_score =
                    local_dip_score(frames, &frames.rms, source_time, params.boundary_tolerance);
                confidence_dip_score = local_dip_score(
                    frames,
                    &frames.voiced_probability,
                    source_time,
                    params.boundary_tolerance,
                );
                evidence_score = onset_score.max(rms_dip_score).max(confidence_dip_score);
                let split = evidence_score >= params.boundary_onset_threshold;
                (
                    split,
                    if split {
                        "same-pitch-onset"
                    } else {
                        "same-pitch-merge"
                    },
                )
            };
            Boundary {
                left_cell: left.index,
                right_cell: right.index,
                source_time,
                project_time: left.project_end,
                onset_score,
                rms_dip_score,
                confidence_dip_score,
                evidence_score,
                split,
                reason,
            }
        })
        .collect()
}

fn local_dip_score(frames: &Frames, values: &[f64], boundary_time: f64, tolerance: f64) -> f64 {
    let mut before_max = f64::NEG_INFINITY;
    let mut after_max = f64::NEG_INFINITY;
    let mut around_min = f64::INFINITY;
    for (&time, &value) in frames.times.iter().zip(values) {
        let before = time >= boundary_time - tolerance && time < boundary_time;
        let after = time >= boundary_time && time <= boundary_time + tolerance;
        if before {
            before_max = before_max.max(value);
        }
        if after {
            after_max = after_max.max(value);
        }
        if before || after {
            around_min = around_min.min(value);
        }
    }
    if !before_max.is_finite() || !after_max.is_finite() {
        return 0.0;
    }
    let baseline = before_max.min(after_max);
    if baseline <= 0.0 {
        return 0.0;
    }
    ((baseline - around_min) / baseline).clamp(0.0, 1.0)
}

fn merge_cells(cells: &[GridCell], boundaries: &[Boundary]) -> Vec<Note> {
    let boundary_by_left: HashMap<i64, &Boundary> = boundaries
        .iter()
        .map(|boundary| (boundary.left_cell, boundary))
        .collect();
    let mut notes: Vec<Note> = Vec::new();
    let mut current: Option<Note> = None;
    for cell in cells {
        let Some(pitch) = cell.pitch else {
            if let Some(note) = current.take() {
                notes.push(note);
            }
            continue;
        };
        let split = match &current {
            None => true,
            Some(note) => boundary_by_left[&note.last_cell].split,
        };
        if split {
            if let Some(note) = current.take() {
                notes.push(note);
            }
            current = Some(Note {
                pitch,
                project_start: cell.project_start,
                project_end: cell.project_end,
                first_cell: cell.index,
                last_cell: cell.index,
            });
        } else {
            let note = current.as_mut().expect("merge continues an open note");
            note.project_end = cell.project_end;
            note.last_cell = cell.index;
        }
    }
    notes.extend(current);
    notes
}

fn make_activity_notes(cells: &[ActivityCell], pitch: i32) -> Vec<Note> {
    let mut notes: Vec<Note> = Vec::new();
    let mut current: Option<Note> = None;
    for cell in cells {
        if !cell.active {
            notes.extend(current.take());
            continue;
        }
        match current.as_mut() {
            None => {
                current = Some(Note {
                    pitch,
                    project_start: cell.project_start,
                    project_end: cell.project_end,
                    first_cell: cell.index,
                    last_cell: cell.index,
                });
            }
            Some(note) => {
                note.project_end = cell.project_end;
                note.last_cell = cell.index;
            }
        }
    }
    notes.extend(current);
    notes
}

fn make_activity_onset_notes(
    cells: &[GridCell],
    activity_cells: &[ActivityCell],
    frames: &Frames,
    params: &Params,
) -> Vec<Note> {
    let mut notes: Vec<Note> = Vec::new();
    let mut current: Option<Note> = None;
    for (cell, activity_cell) in cells.iter().zip(activity_cells) {
        if !activity_cell.active {
            notes.extend(current.take());
            continue;
        }
        let onset_score = frames
            .times
            .iter()
            .zip(&frames.onset)
            .filter(|(&time, _)| time >= cell.source_start && time < cell.source_end)
            .map(|(_, &onset)| onset)
            .fold(0.0, f64::max);
        if current.is_none() || onset_score >= params.boundary_onset_threshold {
            notes.extend(current.take());
            current = Some(Note {
                pitch: params.activity_pitch,
                project_start: cell.project_start,
                project_end: cell.project_end,
                first_cell: cell.index,
                last_cell: cell.index,
            });
        } else {
            let note = current.as_mut().expect("continuation extends an open note");
            note.project_end = cell.project_end;
            note.last_cell = cell.index;
        }
    }
    notes.extend(current);
    notes
}

fn assign_region_pitches(notes: &[Note], frames: &Frames, params: &Params) -> Vec<PitchDecision> {
    notes
        .iter()
        .map(|note| {
            let source_start = note.project_start - params.offset;
            let source_end = note.project_end - params.offset;
            let mut weight_by_pitch: BTreeMap<i32, f64> = BTreeMap::new();
            let mut evidence_frames = 0usize;
            for i in 0..frames.times.len() {
                let time = frames.times[i];
                if time >= source_start
                    && time < source_end
                    && frames.voiced_flag[i]
                    && frames.midi_pitch[i].is_finite()
                {
                    evidence_frames += 1;
                    let weight = 0.1 + 0.9 * frames.voiced_probability[i];
                    *weight_by_pitch
                        .entry(frames.midi_pitch[i].round() as i32)
                        .or_default() += weight;
                }
            }
            let mut pitch_weights: Vec<(f64, i32)> = weight_by_pitch
                .into_iter()
                .map(|(pitch, weight)| (weight, pitch))
                .collect();
            // Strongest weight first; ties prefer the lower pitch.
            pitch_weights.sort_by(|a, b| {
                b.0.partial_cmp(&a.0)
                    .expect("finite weights")
                    .then(a.1.cmp(&b.1))
            });
            let (pitch, winner_weight, runner_up_pitch, runner_up_weight, margin) =
                match pitch_weights.first() {
                    Some(&(winner_weight, pitch)) => {
                        let (runner_up_weight, runner_up_pitch) = pitch_weights
                            .get(1)
                            .map_or((0.0, None), |&(weight, pitch)| (weight, Some(pitch)));
                        let total: f64 = pitch_weights.iter().map(|(weight, _)| weight).sum();
                        (
                            pitch,
                            winner_weight,
                            runner_up_pitch,
                            runner_up_weight,
                            winner_weight / total,
                        )
                    }
                    None => (params.activity_pitch, 0.0, None, 0.0, 0.0),
                };
            PitchDecision {
                note: Note {
                    pitch,
                    ..note.clone()
                },
                evidence_frames,
                winner_weight,
                runner_up_pitch,
                runner_up_weight,
                margin,
            }
        })
        .collect()
}

pub fn seconds_to_ticks(seconds: f64, bpm: f64) -> u32 {
    (seconds * bpm / 60.0 * TICKS_PER_BEAT as f64).round() as u32
}

pub fn midi_bytes(notes: &[Note], bpm: f64) -> Vec<u8> {
    use midly::num::{u15, u24, u28, u4, u7};
    use midly::{
        Format, Header, MetaMessage, MidiMessage, Smf, Timing, TrackEvent, TrackEventKind,
    };

    let mut smf = Smf::new(Header::new(
        Format::Parallel,
        Timing::Metrical(u15::new(TICKS_PER_BEAT)),
    ));
    let tempo = (60_000_000.0 / bpm).round() as u32;
    smf.tracks.push(vec![
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::Tempo(u24::new(tempo))),
        },
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
        },
    ]);
    let mut track = vec![TrackEvent {
        delta: u28::new(0),
        kind: TrackEventKind::Meta(MetaMessage::TrackName(b"Grid-guided bass")),
    }];
    let mut previous_tick = 0u32;
    for note in notes {
        let start_tick = seconds_to_ticks(note.project_start, bpm);
        let end_tick = (start_tick + 1).max(seconds_to_ticks(note.project_end, bpm));
        let key = u7::new(note.pitch.clamp(0, 127) as u8);
        track.push(TrackEvent {
            delta: u28::new(start_tick - previous_tick),
            kind: TrackEventKind::Midi {
                channel: u4::new(0),
                message: MidiMessage::NoteOn {
                    key,
                    vel: u7::new(100),
                },
            },
        });
        track.push(TrackEvent {
            delta: u28::new(end_tick - start_tick),
            kind: TrackEventKind::Midi {
                channel: u4::new(0),
                message: MidiMessage::NoteOff {
                    key,
                    vel: u7::new(0),
                },
            },
        });
        previous_tick = end_tick;
    }
    track.push(TrackEvent {
        delta: u28::new(0),
        kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
    });
    smf.tracks.push(track);
    let mut bytes = Vec::new();
    smf.write(&mut bytes).expect("write midi to memory");
    bytes
}

const CSV_COLUMNS: [&str; 31] = [
    "record_type",
    "index",
    "source_start",
    "source_end",
    "project_start",
    "project_end",
    "f0_hz",
    "midi_pitch",
    "pitch",
    "voiced",
    "confidence",
    "voiced_coverage",
    "frame_count",
    "voiced_frame_count",
    "onset_score",
    "rms",
    "rms_db",
    "activity_off_db",
    "activity_on_db",
    "active",
    "rms_dip_score",
    "confidence_dip_score",
    "evidence_score",
    "split",
    "reason",
    "first_cell",
    "last_cell",
    "winner_weight",
    "runner_up_pitch",
    "runner_up_weight",
    "margin",
];

pub fn diagnostics_csv(pipeline: &Pipeline, params: &Params) -> String {
    let mut out = String::new();
    out.push_str(&CSV_COLUMNS.join(","));
    out.push_str("\r\n");
    let frames = &pipeline.frames;
    for i in 0..frames.times.len() {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "frame".into()),
                ("index", i.to_string()),
                ("source_start", frames.times[i].to_string()),
                (
                    "project_start",
                    (frames.times[i] + params.offset).to_string(),
                ),
                ("f0_hz", finite_or_empty(frames.f0[i])),
                ("midi_pitch", finite_or_empty(frames.midi_pitch[i])),
                ("voiced", (frames.voiced_flag[i] as u8).to_string()),
                ("confidence", frames.voiced_probability[i].to_string()),
                ("onset_score", frames.onset[i].to_string()),
                ("rms", frames.rms[i].to_string()),
            ],
        );
    }
    for cell in &pipeline.cells {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "cell".into()),
                ("index", cell.index.to_string()),
                ("source_start", cell.source_start.to_string()),
                ("source_end", cell.source_end.to_string()),
                ("project_start", cell.project_start.to_string()),
                ("project_end", cell.project_end.to_string()),
                ("pitch", cell.pitch.map_or(String::new(), |p| p.to_string())),
                ("confidence", cell.vote_confidence.to_string()),
                ("voiced_coverage", cell.voiced_coverage.to_string()),
                ("frame_count", cell.frame_count.to_string()),
                ("voiced_frame_count", cell.voiced_frame_count.to_string()),
            ],
        );
    }
    for cell in &pipeline.activity_cells {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "activity".into()),
                ("index", cell.index.to_string()),
                ("source_start", cell.source_start.to_string()),
                ("source_end", cell.source_end.to_string()),
                ("project_start", cell.project_start.to_string()),
                ("project_end", cell.project_end.to_string()),
                ("rms", cell.rms.to_string()),
                ("rms_db", finite_or_empty(cell.rms_db)),
                ("activity_off_db", params.activity_off_db.to_string()),
                ("activity_on_db", params.activity_on_db.to_string()),
                ("active", (cell.active as u8).to_string()),
            ],
        );
    }
    for boundary in &pipeline.boundaries {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "boundary".into()),
                (
                    "index",
                    format!("{}:{}", boundary.left_cell, boundary.right_cell),
                ),
                ("source_start", boundary.source_time.to_string()),
                ("project_start", boundary.project_time.to_string()),
                ("onset_score", boundary.onset_score.to_string()),
                ("rms_dip_score", boundary.rms_dip_score.to_string()),
                (
                    "confidence_dip_score",
                    boundary.confidence_dip_score.to_string(),
                ),
                ("evidence_score", boundary.evidence_score.to_string()),
                ("split", (boundary.split as u8).to_string()),
                ("reason", boundary.reason.into()),
            ],
        );
    }
    for (i, note) in pipeline.legacy_notes.iter().enumerate() {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "note".into()),
                ("index", i.to_string()),
                ("project_start", note.project_start.to_string()),
                ("project_end", note.project_end.to_string()),
                ("pitch", note.pitch.to_string()),
                ("first_cell", note.first_cell.to_string()),
                ("last_cell", note.last_cell.to_string()),
            ],
        );
    }
    for (i, decision) in pipeline.pitch_decisions.iter().enumerate() {
        push_csv_row(
            &mut out,
            &[
                ("record_type", "segmented_pitch".into()),
                ("index", i.to_string()),
                ("project_start", decision.note.project_start.to_string()),
                ("project_end", decision.note.project_end.to_string()),
                ("pitch", decision.note.pitch.to_string()),
                ("voiced_frame_count", decision.evidence_frames.to_string()),
                ("winner_weight", decision.winner_weight.to_string()),
                (
                    "runner_up_pitch",
                    decision
                        .runner_up_pitch
                        .map_or(String::new(), |p| p.to_string()),
                ),
                ("runner_up_weight", decision.runner_up_weight.to_string()),
                ("margin", decision.margin.to_string()),
                ("first_cell", decision.note.first_cell.to_string()),
                ("last_cell", decision.note.last_cell.to_string()),
            ],
        );
    }
    out
}

fn push_csv_row(out: &mut String, values: &[(&str, String)]) {
    let mut fields = vec![String::new(); CSV_COLUMNS.len()];
    for (name, value) in values {
        let position = CSV_COLUMNS
            .iter()
            .position(|column| column == name)
            .expect("known csv column");
        fields[position] = value.clone();
    }
    out.push_str(&fields.join(","));
    out.push_str("\r\n");
}

fn finite_or_empty(value: f64) -> String {
    if value.is_finite() {
        value.to_string()
    } else {
        String::new()
    }
}
