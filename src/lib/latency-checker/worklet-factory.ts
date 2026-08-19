export const CAPTURE_PROCESSOR_NAME = "latency-capture";

export type CaptureMessage =
  | { type: "channels"; value: number }
  | { type: "samples"; frameStart: number; samples: Float32Array };

type WorkletProcessorConstructor = new () => { port: MessagePort };
declare const AudioWorkletProcessor: WorkletProcessorConstructor;
declare const currentFrame: number;

type WorkletControlMessage =
  | { type: "active"; value: boolean }
  | { type: "channel"; value: number };

export function createCaptureWorkletSource() {
  return `
    const CaptureProcessor = (${createCaptureProcessor.toString()})();
    registerProcessor("${CAPTURE_PROCESSOR_NAME}", CaptureProcessor);
  `;
}

function createCaptureProcessor() {
  return class CaptureProcessor extends AudioWorkletProcessor {
    declare active: boolean;
    declare channel: number;
    declare lastChannelCount: number;

    constructor() {
      super();
      this.active = false;
      this.channel = 0;
      this.lastChannelCount = -1;
      this.port.onmessage = (event: MessageEvent<WorkletControlMessage>) => {
        if (event.data.type === "active") {
          this.active = event.data.value;
        }
        if (event.data.type === "channel") {
          this.channel = event.data.value;
        }
      };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
      const channels = inputs[0] || [];
      const output = outputs[0] || [];
      for (const samples of output) {
        samples.fill(0);
      }
      if (channels.length !== this.lastChannelCount) {
        this.lastChannelCount = channels.length;
        this.port.postMessage({ type: "channels", value: channels.length });
      }
      if (this.active && channels.length > 0) {
        const selected = channels[this.channel];
        if (!selected) {
          return true;
        }
        const copy = new Float32Array(selected);
        this.port.postMessage(
          {
            type: "samples",
            frameStart: currentFrame,
            samples: copy,
          },
          [copy.buffer],
        );
      }
      return true;
    }
  };
}
