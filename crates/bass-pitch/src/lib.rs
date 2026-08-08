//! Grid-guided monophonic bass transcription core.
//!
//! Port of `tools/bass-pitch/main.py`. The pipeline takes plain mono samples plus a
//! params struct so a future wasm wrapper can reuse it unchanged. Feature
//! extraction approximates librosa behaviorally rather than numerically, so
//! thresholds tuned against the Python harness must be re-swept, as recorded
//! in `docs/bass-pitch/history.md`.

use std::collections::BTreeMap;
use std::f64::consts::PI;

use pyin::{Framing, PYINExecutor, PadMode};
use realfft::RealFftPlanner;

mod diagnostics;
mod midi;

pub use diagnostics::diagnostics_csv;
pub use midi::{midi_bytes, seconds_to_ticks, TICKS_PER_BEAT};

#[derive(Clone, Copy, Debug)]
/// Progress through the independently analyzed pYIN chunks.
pub struct ChunkProgress {
    /// Number of chunks whose retained frames are available.
    pub completed: usize,
    /// Total number of chunks for the selected audio excerpt.
    pub total: usize,
}

#[derive(Clone, Debug, serde::Deserialize)]
/// Analysis, grid, and decision parameters shared by the native and WASM frontends.
pub struct Params {
    /// Start of the analyzed excerpt in source-audio seconds.
    pub start: f64,
    /// Project placement of source time zero, in seconds.
    pub offset: f64,
    /// Project tempo in quarter-note beats per minute.
    pub bpm: f64,
    /// Number of decision cells in one quarter-note beat.
    pub cells_per_beat: u32,
    /// Project time, in seconds, of grid boundary zero.
    pub grid_origin: f64,
    /// dBFS threshold below which an active run ends.
    pub activity_off_db: f64,
    /// dBFS threshold at which an inactive run begins.
    pub activity_on_db: f64,
    /// Fallback MIDI pitch used by diagnostic stages with no pitch evidence.
    pub activity_pitch: i32,
    /// Lowest frequency considered by pYIN, in hertz.
    pub fmin: f64,
    /// Highest frequency considered by pYIN, in hertz.
    pub fmax: f64,
    /// Normalized onset score required to split an active region.
    pub boundary_onset_threshold: f64,
    /// Input audio sample rate in hertz.
    pub sample_rate: u32,
    /// Analysis window length in samples. The default 2048 samples is about
    /// 92.9 ms at 22.05 kHz, which includes several cycles of a low bass note.
    pub frame_length: usize,
    /// Distance between consecutive frame centers in samples. The default 256
    /// samples is about 11.6 ms, so adjacent 2048-sample windows overlap by
    /// 87.5%. This keeps the long window needed for low-pitch detection while
    /// producing frequent measurements for onset and grid timing.
    pub hop_length: usize,
}

/// Struct of arrays with one record per analysis-window center. Values at the
/// same index belong to one feature record. The overlapping waveform windows
/// used to compute these records are not stored.
pub struct Frames {
    /// Center time of each feature record in source-audio seconds.
    pub times: Vec<f64>,
    /// Root mean square (RMS) amplitude for each analysis window.
    pub rms: Vec<f64>,
    /// Onset novelty normalized against the excerpt's 95th percentile.
    pub onset: Vec<f64>,
    /// pYIN fundamental frequency estimates in hertz, or NaN when unvoiced.
    pub f0: Vec<f64>,
    /// Viterbi-decoded pYIN voiced state.
    pub voiced_flag: Vec<bool>,
    /// pYIN periodicity confidence in the range 0 through 1.
    pub voiced_probability: Vec<f64>,
}

impl Frames {
    /// Returns frame indices whose center time is in the half-open source-time
    /// range. This currently scans all frames for each cell or region because
    /// pYIN dominates runtime. An ordered cursor can replace it if needed.
    fn indices_in_range(&self, start: f64, end: f64) -> impl Iterator<Item = usize> + '_ {
        self.times
            .iter()
            .enumerate()
            .filter(move |(_, &time)| time >= start && time < end)
            .map(|(index, _)| index)
    }
}

#[derive(Clone, Debug)]
/// One project-grid interval used to pool frame-level evidence.
pub struct GridCell {
    /// Grid-relative index, which may be negative before grid boundary zero.
    pub index: i64,
    /// Cell start in source-audio seconds.
    pub source_start: f64,
    /// Cell end in source-audio seconds.
    pub source_end: f64,
    /// Cell start in project seconds.
    pub project_start: f64,
    /// Cell end in project seconds.
    pub project_end: f64,
}

#[derive(Clone, Debug)]
/// One grid cell's loudness-based note-presence decision.
pub struct ActivityCell {
    pub index: i64,
    pub source_start: f64,
    pub source_end: f64,
    pub project_start: f64,
    pub project_end: f64,
    /// Median root mean square (RMS) amplitude of frames inside the cell.
    pub rms: f64,
    /// Hysteresis state after evaluating this cell.
    pub active: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
/// A grid-aligned monophonic MIDI note in project time.
pub struct Note {
    /// Integer MIDI note number.
    pub pitch: i32,
    /// Inclusive note start in project seconds.
    pub project_start: f64,
    /// Exclusive note end in project seconds.
    pub project_end: f64,
    /// First grid cell included in the note.
    pub first_cell: i64,
    /// Last grid cell included in the note.
    pub last_cell: i64,
}

#[derive(Clone, Debug)]
/// Pitch-vote result and diagnostics for one activity/onset note region.
pub struct PitchDecision {
    /// Region relabeled with the winning pitch.
    pub note: Note,
    /// Number of finite pYIN voiced frames contributing evidence.
    pub evidence_frames: usize,
    /// Sum of confidence-derived weights for the winning pitch.
    pub winner_weight: f64,
    /// Second-highest rounded MIDI pitch, when one exists.
    pub runner_up_pitch: Option<i32>,
    pub runner_up_weight: f64,
    /// Winner weight divided by the total vote weight.
    pub margin: f64,
}

/// Full transcription result, including each observable diagnostic stage.
pub struct Pipeline {
    pub frames: Frames,
    pub cells: Vec<GridCell>,
    pub activity_cells: Vec<ActivityCell>,
    /// Fixed-pitch regions produced from activity alone.
    pub activity_notes: Vec<Note>,
    /// Fixed-pitch activity regions split by onset evidence.
    pub onset_notes: Vec<Note>,
    /// Shipping segmented regions with their assigned pitches and diagnostics.
    pub pitch_decisions: Vec<PitchDecision>,
}

/// Runs feature extraction followed by activity detection, onset segmentation,
/// and region-level pitch assignment, retaining every intermediate stage for
/// diagnostics.
pub fn run_pipeline(
    audio: &[f32],
    params: &Params,
    on_progress: &mut dyn FnMut(ChunkProgress),
) -> Pipeline {
    let frames = analyze(audio, params, on_progress);
    let excerpt_end = params.start + audio.len() as f64 / params.sample_rate as f64;
    let cells = make_grid_cells(
        params.start,
        excerpt_end,
        params.offset,
        params.bpm,
        params.cells_per_beat,
        params.grid_origin,
    );
    let activity_cells = detect_activity(
        &cells,
        &frames,
        db_to_gain(params.activity_off_db),
        db_to_gain(params.activity_on_db),
    );
    let activity_notes = make_activity_notes(&activity_cells, params.activity_pitch);
    let onset_notes = make_activity_onset_notes(
        &cells,
        &activity_cells,
        &frames,
        params.activity_pitch,
        params.boundary_onset_threshold,
    );
    let pitch_decisions = assign_region_pitches(&onset_notes, &frames, params.offset);
    Pipeline {
        frames,
        cells,
        activity_cells,
        activity_notes,
        onset_notes,
        pitch_decisions,
    }
}

/// Computes aligned root mean square (RMS), onset, and pYIN frame series from
/// mono input samples.
///
/// Feature implementations can produce slightly different lengths, so output
/// arrays are truncated to their common prefix before frame times are assigned.
pub fn analyze(
    audio: &[f32],
    params: &Params,
    on_progress: &mut dyn FnMut(ChunkProgress),
) -> Frames {
    let audio: Vec<f64> = audio.iter().map(|&sample| sample as f64).collect();
    let rms = calculate_rms_frames(&audio, params.frame_length, params.hop_length);
    let onset = calculate_onset_strength(
        &audio,
        params.frame_length,
        params.hop_length,
        params.sample_rate,
    );
    let (f0, voiced_flag, voiced_probability) = calculate_pyin_frames(&audio, params, on_progress);

    let count = rms.len().min(onset.len()).min(f0.len());
    Frames {
        times: (0..count)
            .map(|i| params.start + (i * params.hop_length) as f64 / params.sample_rate as f64)
            .collect(),
        rms: rms[..count].to_vec(),
        onset: onset[..count].to_vec(),
        f0: f0.into_iter().take(count).collect(),
        voiced_flag: voiced_flag.into_iter().take(count).collect(),
        voiced_probability: voiced_probability.into_iter().take(count).collect(),
    }
}

/// Computes root mean square (RMS) amplitude over zero-padded windows centered
/// on the same hop grid as onset and pYIN analysis.
fn calculate_rms_frames(audio: &[f64], frame_length: usize, hop_length: usize) -> Vec<f64> {
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

/// Mel-banded log-power spectral flux as an onset novelty signal, following
/// the shape of librosa's `onset_strength` without exact mel filter weights.
/// Banding must happen before the rectified difference. Per-bin jitter on
/// decay tails cancels inside a band, while rectifying per-bin differences
/// turns that jitter into false flux peaks on decaying notes.
fn calculate_onset_strength(
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
    normalize_onset_strength(&shifted)
}

/// Scales onset strength by the 95th percentile of its positive finite values,
/// then clamps it to 0 through 1 so thresholds are relative to the excerpt.
/// Returns zeros when no positive finite onset value exists. The percentile is
/// an empirical policy retained from the Python evaluation harness.
fn normalize_onset_strength(values: &[f64]) -> Vec<f64> {
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

const CHUNK_SECONDS: usize = 10;
const CHUNK_DISCARD_FRAMES: usize = 32;

/// pYIN dominates analysis time, so it runs demucs-style: an orchestration
/// loop feeds frame-aligned chunks with discarded real-audio context on both
/// sides to the unmodified pyin crate and reports per-chunk progress. Viterbi
/// decoding is formally global, but competing paths merge within tens of
/// frames, so the discard margin absorbs chunk-boundary effects; a single
/// chunk sees the whole excerpt and is bit-identical to unchunked analysis.
fn calculate_pyin_frames(
    audio: &[f64],
    params: &Params,
    on_progress: &mut dyn FnMut(ChunkProgress),
) -> (Vec<f64>, Vec<bool>, Vec<f64>) {
    let hop = params.hop_length;
    let n_frames = audio.len() / hop + 1;
    let frames_per_chunk = (CHUNK_SECONDS * params.sample_rate as usize).div_ceil(hop);
    let total = n_frames.div_ceil(frames_per_chunk).max(1);
    let mut executor = PYINExecutor::<f64>::new(
        params.fmin,
        params.fmax,
        params.sample_rate,
        params.frame_length,
        None,
        Some(hop),
        None,
    );
    let mut f0 = Vec::with_capacity(n_frames);
    let mut voiced_flag = Vec::with_capacity(n_frames);
    let mut voiced_probability = Vec::with_capacity(n_frames);
    for chunk in 0..total {
        let first = chunk * frames_per_chunk;
        let last = ((chunk + 1) * frames_per_chunk).min(n_frames);
        let context_first = first.saturating_sub(CHUNK_DISCARD_FRAMES);
        let context_last = (last + CHUNK_DISCARD_FRAMES).min(n_frames);
        // The slice starts on the hop grid so chunk frame centers coincide
        // with global frame centers, and it extends half a window past the
        // last needed center so kept frames see only real audio. Frames whose
        // windows the slice truncates lie inside the discarded context, except
        // at the true excerpt edges where zero padding matches the unchunked
        // behavior.
        let start_sample = context_first * hop;
        let end_sample = ((context_last - 1) * hop + params.frame_length / 2).min(audio.len());
        let (_timestamps, chunk_f0, chunk_flag, chunk_probability) = executor.pyin(
            &audio[start_sample..end_sample],
            f64::NAN,
            Framing::Center(PadMode::Constant(0.)),
        );
        let keep = (first - context_first)..(last - context_first);
        f0.extend(chunk_f0.iter().skip(keep.start).take(keep.len()));
        voiced_flag.extend(chunk_flag.iter().skip(keep.start).take(keep.len()));
        voiced_probability.extend(chunk_probability.iter().skip(keep.start).take(keep.len()));
        on_progress(ChunkProgress {
            completed: chunk + 1,
            total,
        });
    }
    (f0, voiced_flag, voiced_probability)
}

fn hz_to_midi(hz: f64) -> f64 {
    12.0 * (hz / 440.0).log2() + 69.0
}

/// Builds the complete project-grid cells contained in the source excerpt,
/// preserving equivalent source and project time coordinates for each cell.
fn make_grid_cells(
    excerpt_start: f64,
    excerpt_end: f64,
    offset: f64,
    bpm: f64,
    cells_per_beat: u32,
    grid_origin: f64,
) -> Vec<GridCell> {
    let cell_duration = 60.0 / bpm / cells_per_beat as f64;
    let source_origin = grid_origin - offset;
    let epsilon = 1e-9;
    let first_index = ((excerpt_start - source_origin - epsilon) / cell_duration).ceil() as i64;
    let last_index = ((excerpt_end - source_origin + epsilon) / cell_duration).floor() as i64 - 1;
    (first_index..=last_index)
        .map(|index| GridCell {
            index,
            source_start: source_origin + index as f64 * cell_duration,
            source_end: source_origin + (index + 1) as f64 * cell_duration,
            project_start: grid_origin + index as f64 * cell_duration,
            project_end: grid_origin + (index + 1) as f64 * cell_duration,
        })
        .collect()
}

/// Classifies note presence from median cell RMS with separate thresholds for
/// entering and leaving an active run.
fn detect_activity(
    cells: &[GridCell],
    frames: &Frames,
    off_threshold: f64,
    on_threshold: f64,
) -> Vec<ActivityCell> {
    let mut active = false;
    cells
        .iter()
        .map(|cell| {
            let mut in_cell: Vec<f64> = frames
                .indices_in_range(cell.source_start, cell.source_end)
                .map(|index| frames.rms[index])
                .collect();
            let rms = calculate_median(&mut in_cell);
            let threshold = if active { off_threshold } else { on_threshold };
            active = rms >= threshold;
            ActivityCell {
                index: cell.index,
                source_start: cell.source_start,
                source_end: cell.source_end,
                project_start: cell.project_start,
                project_end: cell.project_end,
                rms,
                active,
            }
        })
        .collect()
}

fn gain_to_db(value: f64) -> f64 {
    if value <= 0.0 {
        return f64::NEG_INFINITY;
    }
    20.0 * value.log10()
}

fn db_to_gain(value: f64) -> f64 {
    10.0_f64.powf(value / 20.0)
}

fn calculate_median(values: &mut [f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len() % 2 == 0 {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    }
}

/// Coalesces consecutive active cells into fixed-pitch regions for the
/// activity-only diagnostic stage.
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

/// Splits active runs at cells whose peak normalized onset reaches the
/// configured threshold, while preserving inactive cells as gaps.
fn make_activity_onset_notes(
    cells: &[GridCell],
    activity_cells: &[ActivityCell],
    frames: &Frames,
    pitch: i32,
    onset_threshold: f64,
) -> Vec<Note> {
    let mut notes: Vec<Note> = Vec::new();
    let mut current: Option<Note> = None;
    for (cell, activity_cell) in cells.iter().zip(activity_cells) {
        if !activity_cell.active {
            notes.extend(current.take());
            continue;
        }
        let onset_score = frames
            .indices_in_range(cell.source_start, cell.source_end)
            .map(|index| frames.onset[index])
            .fold(0.0, f64::max);
        if current.is_none() || onset_score >= onset_threshold {
            notes.extend(current.take());
            current = Some(Note {
                pitch,
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

/// Assigns one MIDI pitch to each segmented region by confidence-weighted
/// voting over all finite voiced frames in that region.
///
/// Every voiced frame contributes at least 0.1 weight, so low pYIN confidence
/// can weaken a pitch decision but cannot reject an available pitch estimate.
/// Regions without any finite voiced pitch estimate are omitted.
fn assign_region_pitches(notes: &[Note], frames: &Frames, offset: f64) -> Vec<PitchDecision> {
    notes
        .iter()
        .filter_map(|note| {
            let source_start = note.project_start - offset;
            let source_end = note.project_end - offset;
            let mut weight_by_pitch: BTreeMap<i32, f64> = BTreeMap::new();
            let mut evidence_frames = 0usize;
            for i in frames.indices_in_range(source_start, source_end) {
                if frames.voiced_flag[i] && frames.f0[i].is_finite() {
                    evidence_frames += 1;
                    let weight = 0.1 + 0.9 * frames.voiced_probability[i];
                    *weight_by_pitch
                        .entry(hz_to_midi(frames.f0[i]).round() as i32)
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
            let &(winner_weight, pitch) = pitch_weights.first()?;
            let (runner_up_weight, runner_up_pitch) = pitch_weights
                .get(1)
                .map_or((0.0, None), |&(weight, pitch)| (weight, Some(pitch)));
            let total: f64 = pitch_weights.iter().map(|(weight, _)| weight).sum();
            Some(PitchDecision {
                note: Note {
                    pitch,
                    ..note.clone()
                },
                evidence_frames,
                winner_weight,
                runner_up_pitch,
                runner_up_weight,
                margin: winner_weight / total,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{calculate_median, db_to_gain, gain_to_db, Frames};

    #[test]
    fn converts_between_db_and_gain() {
        assert!((gain_to_db(db_to_gain(-25.0)) + 25.0).abs() < 1e-12);
    }

    #[test]
    fn calculates_median() {
        assert_eq!(calculate_median(&mut []), 0.0);
        assert_eq!(calculate_median(&mut [3.0, 1.0, 2.0]), 2.0);
        assert_eq!(calculate_median(&mut [4.0, 1.0, 3.0, 2.0]), 2.5);
    }

    #[test]
    fn selects_frames_in_half_open_time_range() {
        let frames = Frames {
            times: vec![0.0, 0.5, 1.0, 1.5],
            rms: vec![],
            onset: vec![],
            f0: vec![],
            voiced_flag: vec![],
            voiced_probability: vec![],
        };

        assert_eq!(
            frames.indices_in_range(0.5, 1.5).collect::<Vec<_>>(),
            [1, 2]
        );
    }
}
