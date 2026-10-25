import { StereoAnalyser } from "./audio-analyser.ts";
import { AmpNode } from "./dsp/amp-worklet-node.ts";
import type { AmpParameters } from "./dsp/amp.ts";
import type { MultibandEqParameters } from "./dsp/biquad-eq-multiband.ts";
import { BiquadEqWorkletNode } from "./dsp/biquad-eq-worklet-node.ts";

/** Persistent stereo processing shared by all sources in a mixer channel. */
export class AudioChannel {
  readonly input: GainNode;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly reverbSend: GainNode;
  private readonly amp: AmpNode;
  private readonly equalizer: BiquadEqWorkletNode;
  private analyser?: StereoAnalyser;

  constructor({
    context,
    output,
    reverb,
    amp,
    eq,
    gain,
    pan,
    reverbSend,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
    /** The shared reverb, which the send feeds */
    reverb: AudioNode;
    amp?: AmpParameters;
    eq: MultibandEqParameters;
    gain: number;
    pan: number;
    reverbSend: number;
  }) {
    this.amp = new AmpNode({ context, parameters: amp });
    this.input = this.amp.input;
    this.gain = context.createGain();
    this.gain.gain.value = gain;
    this.equalizer = new BiquadEqWorkletNode({
      context,
      channelCount: 2,
      parameters: eq,
    });
    this.panner = context.createStereoPanner();
    this.panner.pan.value = pan;
    this.amp.output
      .connect(this.equalizer)
      .connect(this.gain)
      .connect(this.panner)
      .connect(output);
    // The send taps after the fader, so the track's gain, mute, and solo apply
    // to its reverb, and before the pan, which the mono reverb can't follow.
    this.reverbSend = context.createGain();
    this.reverbSend.gain.value = reverbSend;
    this.gain.connect(this.reverbSend).connect(reverb);
  }

  setAmp(amp: AmpParameters | undefined): void {
    this.amp.setParameters(amp);
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

  setReverbSend(reverbSend: number): void {
    this.reverbSend.gain.setTargetAtTime(
      reverbSend,
      this.reverbSend.context.currentTime,
      0.01,
    );
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
    this.amp.dispose();
    this.equalizer.dispose();
    this.gain.disconnect();
    this.panner.disconnect();
    this.reverbSend.disconnect();
  }
}
