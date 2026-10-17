import { StereoAnalyser } from "./audio-analyser.ts";
import type { MultibandEqParameters } from "./dsp/biquad-eq-multiband.ts";
import { BiquadEqWorkletNode } from "./dsp/biquad-eq-worklet-node.ts";

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly equalizer: BiquadEqWorkletNode;
  private analyser?: StereoAnalyser;

  constructor({
    context,
    output,
    eq,
    gain,
    pan,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    eq: MultibandEqParameters;
    gain: number;
    pan: number;
  }) {
    this.input = context.createGain();
    this.gain = context.createGain();
    this.gain.gain.value = gain;
    this.equalizer = new BiquadEqWorkletNode({
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

  /** Sends the signal after gain and pan to a node that measures it. */
  connectTap(node: AudioNode): void {
    this.panner.connect(node);
  }

  /**
   * Analyses the signal after gain and pan, so levels follow the fader, mute,
   * and solo. Created on first use, so offline mixes never analyse.
   */
  getAnalyser(): StereoAnalyser {
    if (!this.analyser) {
      this.analyser = new StereoAnalyser(this.panner.context);
      this.panner.connect(this.analyser.input);
    }
    return this.analyser;
  }

  dispose(): void {
    this.analyser?.dispose();
    this.input.disconnect();
    this.equalizer.dispose();
    this.gain.disconnect();
    this.panner.disconnect();
  }
}
