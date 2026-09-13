import { StreamingPitchShifter } from "./pitch-shifter.ts";

const PROCESSOR_NAME = "pitch-shifter";
const BLOCK_FRAMES = 128;
const WINDOW_SECONDS = 0.02;
const SEARCH_SECONDS = 0.03;

type ProcessorOptions = {
  channelCount: number;
  pitchRatio: number;
};

declare const AudioWorkletProcessor: new (
  options?: AudioWorkletNodeOptions,
) => {
  readonly port: MessagePort;
};
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "disposed",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  private readonly shifter: StreamingPitchShifter;
  private readonly silence: Float32Array[];

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount, pitchRatio } = options!
      .processorOptions as ProcessorOptions;
    this.silence = Array.from(
      { length: channelCount },
      () => new Float32Array(BLOCK_FRAMES),
    );
    this.shifter = new StreamingPitchShifter({
      channelCount,
      sampleRate,
      pitchRatio,
      blockFrames: BLOCK_FRAMES,
      windowSeconds: WINDOW_SECONDS,
      searchSeconds: SEARCH_SECONDS,
    });
  }

  // Keep returning true through input gaps for the lifetime of this playback run.
  // The spec allows false/undefined to let active inputs determine lifetime,
  // but our Chromium 151 EQ probe stopped after one callback when the return was
  // omitted, before any explicit disconnection. Use the same explicit lifetime
  // policy here so temporary gaps cannot terminate playback processing.
  // Conversely, disconnecting while returning true leaves DSP running on silence.
  // On stop, PitchShiftBus sets the disposed AudioParam and disconnects this node,
  // so this callback skips DSP and returns false. The next run creates a new node.
  // https://webaudio.github.io/web-audio-api/#callback-audioworketprocess-callback
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (parameters.disposed[0] >= 0.5) {
      return false;
    }
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (output.length === 0) {
      return true;
    }
    // Supply silence for callbacks without active input.
    this.shifter.push(input.length > 0 ? input : this.silence);
    const written = this.shifter.pull(output);
    for (const channel of output) {
      channel.fill(0, written);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PitchShifterProcessor);
