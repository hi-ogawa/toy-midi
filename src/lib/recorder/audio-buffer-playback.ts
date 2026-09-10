import type { EqParameters } from "../dsp/eq.ts";
import {
  createPeakingEqNode,
  setPeakingEqNodeParameters,
} from "../dsp/peaking-eq-node.ts";
import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private pitchShifter?: AudioWorkletNode;
  private eqParameters?: EqParameters;
  private equalizer?: AudioWorkletNode;
  /** Transport timeline time corresponding to source-buffer time zero. */
  private bufferTimelineOffset = 0;
  private timelineRange?: { start: number; end: number };

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.gain = transport.context.createGain();
    this.gain.connect(output);
    this.unregister = transport.register(this);
  }

  setBuffer(buffer?: AudioBuffer): void {
    this.buffer = buffer;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(
      gain,
      this.transport.context.currentTime,
      0.01,
    );
  }

  setEq(parameters: EqParameters): void {
    this.eqParameters = parameters;
    if (this.equalizer) {
      setPeakingEqNodeParameters(this.equalizer, parameters);
    }
  }

  setBufferTimelineOffset(offset: number): void {
    this.bufferTimelineOffset = offset;
  }

  setTimelineRange(range: { start: number; end: number }): void {
    this.timelineRange = range;
  }

  /**
   * Starts this buffer from the transport's shared context and timeline anchor.
   *
   * The buffer's sample zero belongs at its configured offset on the transport
   * timeline. If that point has passed, playback seeks into the buffer. If it is
   * ahead, playback delays the buffer start.
   */
  start(): void {
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const playbackAnchor = this.transport.playbackAnchor!;
    const timelineStart =
      this.timelineRange?.start ?? this.bufferTimelineOffset;
    const timelineEnd =
      this.timelineRange?.end ?? this.bufferTimelineOffset + buffer.duration;
    const elapsed = Math.max(0, playbackAnchor.position - timelineStart);
    const duration = timelineEnd - timelineStart;
    if (elapsed >= duration) {
      return;
    }
    const source = this.transport.context.createBufferSource();
    source.buffer = buffer;
    const playbackRate = this.transport.playbackRate;
    source.playbackRate.value = playbackRate;
    let sourceOutput: AudioNode = source;
    if (playbackRate !== 1) {
      const pitchShifter = createPitchShifterNode({
        context: this.transport.context,
        channelCount: buffer.numberOfChannels,
        pitchRatio: 1 / playbackRate,
      });
      source.connect(pitchShifter);
      sourceOutput = pitchShifter;
      this.pitchShifter = pitchShifter;
    }
    if (this.eqParameters) {
      const equalizer = createPeakingEqNode({
        context: this.transport.context,
        channelCount: buffer.numberOfChannels,
        parameters: this.eqParameters,
      });
      sourceOutput.connect(equalizer);
      sourceOutput = equalizer;
      this.equalizer = equalizer;
    }
    sourceOutput.connect(this.gain);
    source.start(
      playbackAnchor.contextTime +
        Math.max(0, timelineStart - playbackAnchor.position),
      timelineStart - this.bufferTimelineOffset + elapsed,
      duration - elapsed,
    );
    this.source = source;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.pitchShifter?.disconnect();
    this.equalizer?.disconnect();
    this.source = undefined;
    this.pitchShifter = undefined;
    this.equalizer = undefined;
  }

  dispose(): void {
    this.unregister();
    this.gain.disconnect();
  }
}
