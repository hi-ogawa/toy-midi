import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import { BiquadEqNode } from "../dsp/biquad-eq-node.ts";

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly equalizer: BiquadEqNode;

  constructor({
    context,
    output,
    eq,
    gain,
    pan = 0,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    eq: MultibandEqParameters;
    gain: number;
    /** Stereo position from -1 (left) to 1 (right), passing stereo through unchanged at 0 */
    pan?: number;
  }) {
    this.input = context.createGain();
    this.gain = context.createGain();
    this.gain.gain.value = gain;
    this.equalizer = new BiquadEqNode({
      context,
      channelCount: 2,
      parameters: eq,
    });
    this.panner = context.createStereoPanner();
    this.panner.pan.value = pan;
    this.input
      .connect(this.equalizer)
      .connect(this.gain)
      .connect(this.panner)
      .connect(output);
  }

  setEq(eq: MultibandEqParameters): void {
    this.equalizer.setParameters(eq);
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.gain.context.currentTime, 0.01);
  }

  setPan(pan: number): void {
    this.panner.pan.setTargetAtTime(pan, this.panner.context.currentTime, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.equalizer.dispose();
    this.gain.disconnect();
    this.panner.disconnect();
  }
}
