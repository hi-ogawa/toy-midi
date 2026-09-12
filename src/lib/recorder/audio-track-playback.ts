import type { EqParameters } from "../dsp/biquad-eq.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import { PlaybackBus } from "./playback-bus.ts";
import type { AudioContextTransport } from "./transport.ts";

type AudioPlaybackRegion = {
  buffer: AudioBuffer;
  timelineOffset: number;
  timelineStart: number;
  timelineEnd: number;
};

/** Owns region playback and a channel that also accepts independently routed input. */
export class AudioTrackPlayback {
  readonly channel: AudioChannel;
  private readonly transport: AudioContextTransport;
  private readonly playbacks: AudioBufferPlayback[] = [];
  private readonly bus: PlaybackBus;
  /** Mutes region playback without muting other sources connected to channel.input. */
  private readonly playbackGain: GainNode;

  constructor({
    transport,
    output,
    eq,
    gain,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
    eq: EqParameters;
    gain: number;
  }) {
    this.transport = transport;
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq,
      gain,
    });
    this.playbackGain = transport.context.createGain();
    this.playbackGain.connect(this.channel.input);
    this.bus = new PlaybackBus({ transport, output: this.playbackGain });
  }

  setRegions(regions: readonly AudioPlaybackRegion[]): void {
    for (const playback of this.playbacks) {
      playback.dispose();
    }
    this.playbacks.length = 0;
    for (const region of regions) {
      const playback = new AudioBufferPlayback({
        transport: this.transport,
        output: this.bus.input,
      });
      playback.setBuffer(region.buffer);
      playback.setBufferTimelineOffset(region.timelineOffset);
      playback.setTimelineRange({
        start: region.timelineStart,
        end: region.timelineEnd,
      });
      this.playbacks.push(playback);
    }
  }

  setPlaybackMuted(muted: boolean): void {
    this.playbackGain.gain.setValueAtTime(
      muted ? 0 : 1,
      this.transport.context.currentTime,
    );
  }

  dispose(): void {
    this.setRegions([]);
    this.bus.dispose();
    this.playbackGain.disconnect();
    this.channel.dispose();
  }
}
