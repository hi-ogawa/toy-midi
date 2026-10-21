import { StereoAnalyser } from "./audio-analyser.ts";
import { AmpWorkletNode } from "./dsp/amp-worklet-node.ts";
import type { AmpParameters } from "./dsp/amp.ts";
import type { MultibandEqParameters } from "./dsp/biquad-eq-multiband.ts";
import { BiquadEqWorkletNode } from "./dsp/biquad-eq-worklet-node.ts";

export interface TrackAmp extends AmpParameters {
  /**
   * Linear gain into the amp, 1 being unity. The drive depends on input level,
   * so this sets how hard a track drives it.
   */
  inputGain: number;
}

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly equalizer: BiquadEqWorkletNode;
  /** Present only while the track has an amp, so a dry track has no delay. */
  private amp?: {
    inputGain: GainNode;
    node: AmpWorkletNode;
    parameters: AmpParameters;
  };
  private analyser?: StereoAnalyser;

  constructor({
    context,
    output,
    amp,
    eq,
    gain,
    pan,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    amp?: TrackAmp;
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
    this.equalizer.connect(this.gain).connect(this.panner).connect(output);
    this.connectInput(amp);
  }

  setAmp(amp: TrackAmp | undefined): void {
    if (!amp || !this.amp) {
      this.disconnectInput();
      this.connectInput(amp);
      return;
    }
    const { inputGain, ...parameters } = amp;
    this.amp.inputGain.gain.setTargetAtTime(
      inputGain,
      this.input.context.currentTime,
      0.01,
    );
    // Rebuilding the amp's chain restarts its filters, so skip it when only
    // the input gain changed.
    if (
      parameters.preset !== this.amp.parameters.preset ||
      parameters.cabinet !== this.amp.parameters.cabinet
    ) {
      this.amp.node.setParameters(parameters);
      this.amp.parameters = parameters;
    }
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
    this.disconnectInput();
    this.equalizer.dispose();
    this.gain.disconnect();
    this.panner.disconnect();
  }

  private connectInput(amp: TrackAmp | undefined): void {
    if (!amp) {
      this.input.connect(this.equalizer);
      return;
    }
    const { inputGain, ...parameters } = amp;
    const context = this.input.context;
    this.amp = {
      inputGain: context.createGain(),
      node: new AmpWorkletNode({ context, channelCount: 2, parameters }),
      parameters,
    };
    this.amp.inputGain.gain.value = inputGain;
    this.input
      .connect(this.amp.inputGain)
      .connect(this.amp.node)
      .connect(this.equalizer);
  }

  private disconnectInput(): void {
    this.input.disconnect();
    if (this.amp) {
      this.amp.inputGain.disconnect();
      this.amp.node.dispose();
      this.amp = undefined;
    }
  }
}
