use crate::{hz_to_midi, Params, Pipeline};

const CSV_COLUMNS: [&str; 24] = [
    "record_type",
    "index",
    "source_start",
    "source_end",
    "project_start",
    "project_end",
    "rms",
    "rms_db",
    "onset_score",
    "f0_hz",
    "midi_pitch",
    "pitch",
    "voiced",
    "confidence",
    "voiced_frame_count",
    "activity_off_db",
    "activity_on_db",
    "active",
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
                ("rms", frames.rms[i].to_string()),
                ("onset_score", frames.onset[i].to_string()),
                ("f0_hz", finite_or_empty(frames.f0[i])),
                ("midi_pitch", finite_or_empty(hz_to_midi(frames.f0[i]))),
                ("voiced", (frames.voiced_flag[i] as u8).to_string()),
                ("confidence", frames.voiced_probability[i].to_string()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Frames, Note, PitchDecision};

    #[test]
    fn writes_segmented_pitch_rows() {
        let params = Params {
            start: 0.0,
            offset: 0.0,
            bpm: 120.0,
            cells_per_beat: 2,
            grid_origin: 0.0,
            activity_off_db: -25.0,
            activity_on_db: -25.0,
            activity_pitch: 36,
            fmin: 30.0,
            fmax: 400.0,
            boundary_onset_threshold: 0.4,
            sample_rate: 22_050,
            frame_length: 2048,
            hop_length: 256,
        };
        let pipeline = Pipeline {
            frames: Frames {
                times: vec![],
                rms: vec![],
                onset: vec![],
                f0: vec![],
                voiced_flag: vec![],
                voiced_probability: vec![],
            },
            cells: vec![],
            activity_cells: vec![],
            activity_notes: vec![],
            onset_notes: vec![],
            pitch_decisions: vec![PitchDecision {
                note: Note {
                    pitch: 40,
                    project_start: 0.0,
                    project_end: 0.5,
                    first_cell: 0,
                    last_cell: 0,
                },
                evidence_frames: 4,
                winner_weight: 3.0,
                runner_up_pitch: None,
                runner_up_weight: 0.0,
                margin: 1.0,
            }],
        };

        let csv = diagnostics_csv(&pipeline, &params);

        assert!(csv
            .lines()
            .next()
            .unwrap()
            .split(',')
            .any(|column| column == "pitch"));
        assert!(csv
            .lines()
            .nth(1)
            .unwrap()
            .split(',')
            .any(|value| value == "40"));
    }

    #[test]
    fn derives_midi_pitch_from_f0() {
        let params = Params {
            start: 0.0,
            offset: 0.0,
            bpm: 120.0,
            cells_per_beat: 2,
            grid_origin: 0.0,
            activity_off_db: -25.0,
            activity_on_db: -25.0,
            activity_pitch: 36,
            fmin: 30.0,
            fmax: 400.0,
            boundary_onset_threshold: 0.4,
            sample_rate: 22_050,
            frame_length: 2048,
            hop_length: 256,
        };
        let pipeline = Pipeline {
            frames: Frames {
                times: vec![0.0],
                rms: vec![0.0],
                onset: vec![0.0],
                f0: vec![440.0],
                voiced_flag: vec![true],
                voiced_probability: vec![1.0],
            },
            cells: vec![],
            activity_cells: vec![],
            activity_notes: vec![],
            onset_notes: vec![],
            pitch_decisions: vec![],
        };

        let csv = diagnostics_csv(&pipeline, &params);
        let columns: Vec<_> = csv.lines().next().unwrap().split(',').collect();
        let values: Vec<_> = csv.lines().nth(1).unwrap().split(',').collect();
        let midi_pitch = columns
            .iter()
            .position(|column| *column == "midi_pitch")
            .unwrap();

        assert_eq!(values[midi_pitch], "69");
    }
}
