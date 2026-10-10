import { DeclickGain } from "../dsp/declick-gain.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

type ActiveSource = {
  node: AudioBufferSourceNode;
  /** Per-source declick envelope, kept separate from clip gain automation. */
  envelope: DeclickGain;
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
    const envelope = new DeclickGain(context);
    envelope.open(startTime);
    node.connect(envelope.node).connect(this.gain);
    // Disconnect after the stop fade has rendered, not when stop() is called.
    node.onended = () => {
      node.disconnect();
      envelope.node.disconnect();
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
  stop(time: number): void {
    const source = this.source;
    if (!source) {
      return;
    }
    this.source = undefined;
    source.node.stop(source.envelope.close(time));
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
