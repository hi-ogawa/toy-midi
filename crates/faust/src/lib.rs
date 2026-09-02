mod runtime;

#[allow(dead_code, non_snake_case, unused_variables)]
mod capture_meter {
    use crate::runtime::*;

    // Faust emits a source fragment that expects its host traits in scope.
    include!("../generated/capture-meter.rs");
}

use capture_meter::CaptureMeter;
use std::cell::RefCell;

const RENDER_QUANTUM: usize = 128;

thread_local! {
    static PROCESSOR: RefCell<Option<Processor>> = const { RefCell::new(None) };
}

struct Processor {
    dsp: CaptureMeter,
    input: [f32; RENDER_QUANTUM],
    output: [f32; RENDER_QUANTUM],
}

#[no_mangle]
pub extern "C" fn initialize_capture_meter(sample_rate: i32) {
    let mut dsp = CaptureMeter::new();
    dsp.init(sample_rate);
    PROCESSOR.set(Some(Processor {
        dsp,
        input: [0.0; RENDER_QUANTUM],
        output: [0.0; RENDER_QUANTUM],
    }));
}

#[no_mangle]
pub extern "C" fn capture_meter_input() -> *mut f32 {
    PROCESSOR.with_borrow_mut(|processor| {
        processor
            .as_mut()
            .expect("capture meter is initialized")
            .input
            .as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn capture_meter_output() -> *const f32 {
    PROCESSOR.with_borrow(|processor| {
        processor
            .as_ref()
            .expect("capture meter is initialized")
            .output
            .as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn process_capture_meter() {
    PROCESSOR.with_borrow_mut(|processor| {
        let processor = processor.as_mut().expect("capture meter is initialized");
        processor.dsp.compute(
            RENDER_QUANTUM,
            &[&processor.input],
            &mut [&mut processor.output],
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_meter_passes_samples_through() {
        let mut dsp = CaptureMeter::new();
        dsp.init(48_000);
        let input = [-1.0, -0.25, 0.0, 0.5, 1.0];
        let mut output = [0.0; 5];

        dsp.compute(input.len(), &[&input], &mut [&mut output]);

        assert_eq!(output, input);
    }
}
