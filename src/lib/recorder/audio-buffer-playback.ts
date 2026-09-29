import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/**
 * Envelope length at source edges. Long enough to remove the waveform step of
 * entering or leaving a buffer mid-signal, short enough not to sound like a fade.
 */
export const DECLICK_SECONDS = 0.005;

type ActiveSource = {
  node: AudioBufferSourceNode;
  /** Per-source declick envelope, kept separate from clip gain automation. */
  envelope: GainNode;
};

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private playbackSource?: AudioPlaybackSource;
  private source?: ActiveSource;
  /** Sources that have not ended yet, including ones still fading out. */
  private liveSources = 0;
  private disposed = false;

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
    const context = this.transport.context;
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
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = this.transport.playbackRate;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(1, startTime + DECLICK_SECONDS);
    node.connect(envelope).connect(this.gain);
    // Disconnect after the stop fade has rendered, not when stop() is called.
    node.onended = () => {
      node.disconnect();
      envelope.disconnect();
      this.liveSources--;
      this.releaseIfDone();
    };
    node.start(
      startTime,
      timelineStart - timelineOffset + elapsed,
      duration - elapsed,
    );
    this.source = { node, envelope };
    this.liveSources++;
  }

  /** Fades the active source out and stops it once the fade completes. */
  stop(): void {
    const source = this.source;
    if (!source) {
      return;
    }
    this.source = undefined;
    const now = this.transport.context.currentTime;
    const gain = source.envelope.gain;
    // Hold the current envelope value so the ramp starts from it, including
    // during a fade-in or before a delayed start.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + DECLICK_SECONDS);
    source.node.stop(now + DECLICK_SECONDS);
  }

  dispose(): void {
    this.unregister();
    this.disposed = true;
    this.releaseIfDone();
  }

  /** Keeps the output connected until a stopped source finishes its fade. */
  private releaseIfDone(): void {
    if (this.disposed && this.liveSources === 0) {
      this.gain.disconnect();
    }
  }
}
