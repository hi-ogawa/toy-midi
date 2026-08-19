export const CAPTURE_PROCESSOR_NAME = "latency-capture";

export type CaptureMessage =
  | { type: "activeChanged"; value: boolean }
  | { type: "channels"; value: number }
  | { type: "level"; peak: number }
  | { type: "samples"; frameStart: number; samples: Float32Array };

type WorkletProcessorConstructor = new () => { port: MessagePort };
// These globals exist only inside AudioWorkletGlobalScope. Declarations let the
// processor stay type-checked before its source is stringified for that scope.
declare const AudioWorkletProcessor: WorkletProcessorConstructor;
declare const currentFrame: number;

export type WorkletControlMessage =
  | { type: "active"; value: boolean }
  | { type: "channel"; value: number };

export function createCaptureWorkletSource() {
  // The processor has no module imports once stringified, so the generated blob
  // can be registered without a separate worklet build entry point.
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
    declare applyPendingActiveChange?: () => void;

    constructor() {
      super();
      this.active = false;
      this.channel = 0;
      this.lastChannelCount = -1;
      this.meterBlockCount = 0;
      this.meterPeak = 0;
      this.port.onmessage = (event: MessageEvent<WorkletControlMessage>) => {
        if (event.data.type === "active") {
          const value = event.data.value;
          // Construct the protocol action here so process() only owns when the
          // state transition becomes visible to the audio thread.
          this.applyPendingActiveChange = () => {
            this.active = value;
            this.postMessage({ type: "activeChanged", value });
          };
        }
        if (event.data.type === "channel") {
          this.channel = event.data.value;
          // Do not mix meter history from the previously selected channel.
          this.meterBlockCount = 0;
          this.meterPeak = 0;
        }
      };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
      this.applyPendingActiveChange?.();
      this.applyPendingActiveChange = undefined;
      const channels = inputs[0] || [];
      const output = outputs[0] || [];
      // A connected output keeps the processor in the render graph, but capture
      // must never feed input audio back to speakers.
      for (const samples of output) {
        samples.fill(0);
      }
      if (channels.length !== this.lastChannelCount) {
        // Browser track settings can be incomplete, so report the channel count
        // observed in actual render quanta.
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
          // Aggregate render quanta to avoid flooding the main thread with UI
          // meter updates while retaining a responsive peak display.
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
              // currentFrame is the absolute frame of this render quantum and
              // lets the main thread preserve gaps and align scheduled clicks.
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
      // Keep the worklet-to-runtime protocol checked at every send site.
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
