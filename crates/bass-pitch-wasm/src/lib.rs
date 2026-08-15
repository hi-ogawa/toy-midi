//! Wasm wrapper for the grid-guided bass transcription core. Takes mono
//! samples already resampled to `params.sample_rate` by the caller and
//! returns the segmented pitch notes; both sides of the JSON contract are the
//! core crate's `Params` and `Note` structs. Progress is reported to
//! `on_progress` as a 0..1 fraction once per analysis chunk.

use bass_pitch::{run_pipeline, ChunkProgress, Params};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn transcribe(
    samples: &[f32],
    params_json: &str,
    on_progress: &js_sys::Function,
) -> Result<String, JsError> {
    let params: Params = serde_json::from_str(params_json)?;
    let pipeline = run_pipeline(samples, &params, &mut |progress: ChunkProgress| {
        let fraction = progress.completed as f64 / progress.total as f64;
        let _ = on_progress.call1(&JsValue::NULL, &JsValue::from_f64(fraction));
    });
    let notes: Vec<_> = pipeline
        .pitch_decisions
        .iter()
        .map(|decision| &decision.note)
        .collect();
    Ok(serde_json::to_string(&notes)?)
}
