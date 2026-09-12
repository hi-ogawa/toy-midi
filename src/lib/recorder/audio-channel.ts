import { BiquadEqNode, ensureBiquadEqWorklet } from "../dsp/biquad-eq-node.ts";
import type { EqParameters } from "../dsp/biquad-eq.ts";

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private equalizer?: BiquadEqNode;
  private eq: EqParameters;
  private disposed = false;

  constructor({
    context,
    output,
    eq,
    gain,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    eq: EqParameters;
    gain: number;
  }) {
    this.eq = eq;
    this.input = context.createGain();
    this.gain = context.createGain();
    this.gain.gain.value = gain;
    this.gain.connect(output);
  }

  /** Sources remain silent until the worklet is ready. Safe to call repeatedly. */
  async prepare(): Promise<void> {
    await ensureBiquadEqWorklet(this.input.context);
    if (this.disposed || this.equalizer) {
      return;
    }
    this.equalizer = new BiquadEqNode({
      context: this.input.context,
      channelCount: 2,
      parameters: this.eq,
    });
    this.input.connect(this.equalizer).connect(this.gain);
  }

  setEq(eq: EqParameters): void {
    this.eq = eq;
    this.equalizer?.setParameters(eq);
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.gain.context.currentTime, 0.01);
  }

  dispose(): void {
    this.disposed = true;
    this.input.disconnect();
    this.equalizer?.disconnect();
    this.gain.disconnect();
  }
}
