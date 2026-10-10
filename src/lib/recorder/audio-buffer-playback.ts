import { DeclickGain } from "../dsp/declick-gain.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private readonly player: DeclickedBufferPlayer;
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
    this.player = new DeclickedBufferPlayer({
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
    this.player.start({
      buffer,
      playbackRate: this.transport.playbackRate,
      time: startTime,
      offset: timelineStart - timelineOffset + elapsed,
      duration: duration - elapsed,
    });
  }

  stop(): void {
    this.player.stop();
  }

  dispose(): void {
    this.unregister();
    // Keep the clip connected until its stopped sources finish fading.
    this.player.whenSilent(() => this.gain.disconnect());
  }
}

/** One buffer source and its fade, from start until it ends. */
type DeclickedSource = {
  node: AudioBufferSourceNode;
  envelope: DeclickGain;
  stopped: boolean;
};

/**
 * Plays buffer slices into one output, fading each in and out instead of
 * starting or cutting it mid-waveform.
 */
class DeclickedBufferPlayer {
  private readonly context: BaseAudioContext;
  private readonly output: AudioNode;
  /** Sources still sounding, including stopped ones that are fading out. */
  private readonly sources = new Set<DeclickedSource>();
  private onSilent?: () => void;

  constructor({
    context,
    output,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
  }) {
    this.context = context;
    this.output = output;
  }

  /** Plays `duration` buffer seconds from `offset`, starting at audio-clock `time`. */
  start({
    buffer,
    playbackRate,
    time,
    offset,
    duration,
  }: {
    buffer: AudioBuffer;
    playbackRate: number;
    time: number;
    offset: number;
    duration: number;
  }): void {
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = playbackRate;
    const envelope = new DeclickGain(this.context);
    envelope.open(time);
    node.connect(envelope.node).connect(this.output);
    const source: DeclickedSource = { node, envelope, stopped: false };
    // Disconnect after the fade has rendered, not when stop() is called.
    node.onended = () => {
      node.disconnect();
      envelope.node.disconnect();
      this.sources.delete(source);
      if (this.sources.size === 0) {
        const onSilent = this.onSilent;
        this.onSilent = undefined;
        onSilent?.();
      }
    };
    node.start(time, offset, duration);
    this.sources.add(source);
  }

  /** Fades out every source still playing and stops each once silent. */
  stop(): void {
    for (const source of this.sources) {
      if (!source.stopped) {
        source.stopped = true;
        source.node.stop(source.envelope.close());
      }
    }
  }

  /** Runs `callback` once every source has ended, right away if none are sounding. */
  whenSilent(callback: () => void): void {
    if (this.sources.size === 0) {
      callback();
      return;
    }
    this.onSilent = callback;
  }
}
