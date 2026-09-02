use wasm_bindgen::prelude::*;

type F32 = f32;
type FaustFloat = F32;

#[derive(Copy, Clone)]
pub struct ParamIndex(pub i32);

pub trait FaustDsp {
    type T;

    fn new() -> Self
    where
        Self: Sized;
    fn metadata(&self, meta: &mut dyn Meta);
    fn get_sample_rate(&self) -> i32;
    fn get_num_inputs(&self) -> i32;
    fn get_num_outputs(&self) -> i32;
    fn class_init(sample_rate: i32)
    where
        Self: Sized;
    fn instance_reset_params(&mut self);
    fn instance_clear(&mut self);
    fn instance_constants(&mut self, sample_rate: i32);
    fn instance_init(&mut self, sample_rate: i32);
    fn init(&mut self, sample_rate: i32);
    fn build_user_interface(&self, ui: &mut dyn UI<Self::T>);
    fn build_user_interface_static(ui: &mut dyn UI<Self::T>)
    where
        Self: Sized;
    fn get_param(&self, param: ParamIndex) -> Option<Self::T>;
    fn set_param(&mut self, param: ParamIndex, value: Self::T);
    fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut [&mut [Self::T]]);
}

pub trait Meta {
    fn declare(&mut self, key: &str, value: &str);
}

pub trait UI<T> {
    fn open_vertical_box(&mut self, label: &str);
    fn close_box(&mut self);
}

#[allow(dead_code, non_snake_case, unused_variables)]
mod capture_meter {
    use super::*;

    include!("../generated/capture-meter.rs");
}

use capture_meter::CaptureMeter;

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
