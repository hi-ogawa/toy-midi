import type { EqParameters } from "../dsp/biquad-eq.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import { PlaybackBus } from "./playback-bus.ts";
import type { AudioContextTransport } from "./transport.ts";

/** Owns an audio track's source, playback processing, and mixer channel. */
export class AudioTrackPlayback {
  private readonly playback: AudioBufferPlayback;
  private readonly bus: PlaybackBus;
  private readonly channel: AudioChannel;

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
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq,
      gain,
    });
    this.bus = new PlaybackBus({ transport, output: this.channel.input });
    this.playback = new AudioBufferPlayback({
      transport,
      output: this.bus.input,
    });
  }

  setBuffer(buffer?: AudioBuffer): void {
    this.playback.stop();
    this.playback.setBuffer(buffer);
  }

  setBufferTimelineOffset(offset: number): void {
    this.playback.setBufferTimelineOffset(offset);
  }

  setTimelineRange(range: { start: number; end: number }): void {
    this.playback.setTimelineRange(range);
  }

  setEq(eq: EqParameters): void {
    this.channel.setEq(eq);
  }

  setGain(gain: number): void {
    this.channel.setGain(gain);
  }

  dispose(): void {
    this.playback.dispose();
    this.bus.dispose();
    this.channel.dispose();
  }
}
