mod runtime;

#[allow(dead_code, non_snake_case, unused_variables)]
pub mod capture_meter {
    use crate::runtime::*;

    // Faust emits a source fragment that expects its host traits in scope.
    include!("../generated/capture-meter.rs");
}

use capture_meter::CaptureMeter;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn process_capture_meter(input: &[f32], output: &mut [f32], sample_rate: i32) {
    assert_eq!(input.len(), output.len());
    let mut dsp = CaptureMeter::new();
    dsp.init(sample_rate);
    dsp.compute(input.len(), &[input], &mut [output]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_meter_passes_samples_through() {
        let input = [-1.0, -0.25, 0.0, 0.5, 1.0];
        let mut output = [0.0; 5];

        process_capture_meter(&input, &mut output, 48_000);

        assert_eq!(output, input);
    }
}
