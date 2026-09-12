import { BiquadEqNode } from "../dsp/biquad-eq-node.ts";
import type { MultibandEqParameters } from "../dsp/biquad-eq.ts";

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private readonly equalizer: BiquadEqNode;

  constructor({
    context,
    output,
    eq,
    gain,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    eq: MultibandEqParameters;
    gain: number;
  }) {
    this.input = context.createGain();
    this.gain = context.createGain();
    this.gain.gain.value = gain;
    this.equalizer = new BiquadEqNode({
      context,
      channelCount: 2,
      parameters: eq,
    });
    this.input.connect(this.equalizer).connect(this.gain).connect(output);
  }

  setEq(eq: MultibandEqParameters): void {
    this.equalizer.setParameters(eq);
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.gain.context.currentTime, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.equalizer.disconnect();
    this.gain.disconnect();
  }
}
