export const CAPTURE_PROCESSOR_NAME = "latency-capture";

export type CaptureMessage =
  | { type: "channels"; value: number }
  | { type: "level"; peak: number }
  | { type: "samples"; frameStart: number; samples: Float32Array };

type WorkletProcessorConstructor = new () => { port: MessagePort };
declare const AudioWorkletProcessor: WorkletProcessorConstructor;
declare const currentFrame: number;

export type WorkletControlMessage =
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
    declare meterBlockCount: number;
    declare meterPeak: number;

    constructor() {
      super();
      this.active = false;
      this.channel = 0;
      this.lastChannelCount = -1;
      this.meterBlockCount = 0;
      this.meterPeak = 0;
      this.port.onmessage = (event: MessageEvent<WorkletControlMessage>) => {
        if (event.data.type === "active") {
          this.active = event.data.value;
        }
        if (event.data.type === "channel") {
          this.channel = event.data.value;
          this.meterBlockCount = 0;
          this.meterPeak = 0;
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
        this.postMessage({ type: "channels", value: channels.length });
      }
      const selected = channels[this.channel];
      if (selected) {
        for (const sample of selected) {
          this.meterPeak = Math.max(this.meterPeak, Math.abs(sample));
        }
        this.meterBlockCount++;
        if (this.meterBlockCount >= 16) {
          this.postMessage({ type: "level", peak: this.meterPeak });
          this.meterBlockCount = 0;
          this.meterPeak = 0;
        }

        if (this.active) {
          // TODO: Batch multiple render quanta before transferring. The input
          // buffer is browser-owned, and transferred buffers detach, so direct
          // transfer or simple preallocation cannot safely avoid this copy.
          const copy = new Float32Array(selected);
          this.postMessage(
            {
              type: "samples",
              frameStart: currentFrame,
              samples: copy,
            },
            [copy.buffer],
          );
        }
      }
      return true;
    }

    postMessage(message: CaptureMessage, transfer?: Transferable[]) {
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
