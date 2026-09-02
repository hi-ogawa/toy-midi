const PROCESSOR_NAME = "faust-capture-meter";
const RENDER_QUANTUM = 128;

class FaustCaptureMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const bytes = Uint8Array.from(atob("__FAUST_WASM_BASE64__"), (value) =>
      value.charCodeAt(0),
    );
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module, {});
    this.exports = instance.exports;
    this.exports.initialize_capture_meter(sampleRate);
    this.input = new Float32Array(
      this.exports.memory.buffer,
      this.exports.capture_meter_input(),
      RENDER_QUANTUM,
    );
    this.output = new Float32Array(
      this.exports.memory.buffer,
      this.exports.capture_meter_output(),
      RENDER_QUANTUM,
    );
    this.peak = 0;
    this.quantumCount = 0;
  }

  process(inputs, outputs) {
    const source = inputs[0]?.[0];
    if (source) {
      this.input.set(source);
    } else {
      this.input.fill(0);
    }
    this.exports.process_capture_meter();
    outputs[0]?.[0]?.set(this.output);
    for (const sample of this.output) {
      this.peak = Math.max(this.peak, Math.abs(sample));
    }
    this.quantumCount++;
    if (this.quantumCount === 16) {
      this.port.postMessage({ type: "analysis", peak: this.peak });
      this.peak = 0;
      this.quantumCount = 0;
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, FaustCaptureMeterProcessor);
