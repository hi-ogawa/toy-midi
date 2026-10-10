import { DeclickedSources } from "../dsp/declicked-sources.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private readonly sources: DeclickedSources;
  private playbackSource?: AudioPlaybackSource;

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
    this.sources = new DeclickedSources({
      context: transport.context,
      output: this.gain,
    });
    this.unregister = transport.register(this);
  }

  setSource(source: AudioPlaybackSource): void {
    this.playbackSource = source;
    this.gain.gain.value = source.gain;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(
      gain,
      this.transport.context.currentTime,
      0.01,
    );
  }

  /** Schedules the slice from the transport anchor, seeking or delaying as needed. */
  start(): void {
    const playbackSource = this.playbackSource;
    if (!playbackSource) {
      return;
    }
    const playbackAnchor = this.transport.playbackAnchor!;
    const { buffer, timelineOffset, timelineStart, timelineEnd } =
      playbackSource;
    const elapsed = Math.max(0, playbackAnchor.position - timelineStart);
    const duration = timelineEnd - timelineStart;
    if (elapsed >= duration) {
      return;
    }
    const startTime =
      playbackAnchor.contextTime +
      Math.max(0, timelineStart - playbackAnchor.position) /
        this.transport.playbackRate;
    this.sources.start({
      buffer,
      playbackRate: this.transport.playbackRate,
      time: startTime,
      offset: timelineStart - timelineOffset + elapsed,
      duration: duration - elapsed,
    });
  }

  stop(time: number): void {
    this.sources.stop(time);
  }

  dispose(): void {
    this.unregister();
    // Keep the clip connected until its stopped sources finish fading.
    this.sources.whenSilent(() => this.gain.disconnect());
  }
}
