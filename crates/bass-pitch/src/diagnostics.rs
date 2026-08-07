use crate::{Params, Pipeline};

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
