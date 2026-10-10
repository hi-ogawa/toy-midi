import { DeclickGain } from "../dsp/declick-gain.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import {
  type AudioContextTransport,
  type ContextTimeWindow,
  getPlaybackPasses,
  getPassContextTime,
  getPassPosition,
  type PlaybackPass,
  startLookaheadScheduler,
  type TransportParticipant,
} from "./transport.ts";

/**
 * Plays one clip region as a series of buffer slices, one per loop pass the
 * region intersects. Each slice ends exactly where the next pass begins, so a
 * loop wrap needs no stop and restart.
 */
export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private readonly player: DeclickedBufferPlayer;
  private playbackSource?: AudioPlaybackSource;
  private nextPassIndex = 0;
  private disposeScheduling?: () => void;

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

  start(): void {
    if (!this.playbackSource) {
      return;
    }
    this.nextPassIndex = 0;
    this.disposeScheduling = startLookaheadScheduler({
      context: this.transport.context,
      from: this.transport.playbackRun!.contextTime,
      schedule: (window) => this.schedule(window),
    });
  }

  /** Fades out sounding slices and cancels slices queued for later passes. */
  stop(): void {
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
    this.player.stop();
  }

  dispose(): void {
    this.unregister();
    // Keep the clip connected until its stopped sources finish fading.
    void this.player.waitForSilence().then(() => this.gain.disconnect());
  }

  /** Queues one slice for each loop pass, in the first window that reaches it. */
  private schedule(window: ContextTimeWindow): void {
    const playbackRun = this.transport.playbackRun!;
    for (const pass of getPlaybackPasses(playbackRun, window)) {
      if (pass.index < this.nextPassIndex) {
        continue;
      }
      this.nextPassIndex = pass.index + 1;
      this.startSlice(pass, window);
    }
  }

  /** Plays the part of the region inside one pass. */
  private startSlice(pass: PlaybackPass, window: ContextTimeWindow): void {
    const { buffer, timelineOffset, timelineStart, timelineEnd } =
      this.playbackSource!;
    // Join mid-region at the playhead, or at the window start if a stalled
    // timer let the pass begin before its slice was queued.
    const start = Math.max(
      timelineStart,
      pass.start,
      getPassPosition(pass, window.from),
    );
    const end = Math.min(timelineEnd, pass.end);
    if (start >= end) {
      return;
    }
    // A later pass that enters at loop-in while the region also covers
    // loop-out continues the previous pass's slice, which ends at this same
    // instant, so fading in would dip the splice.
    const continuesPreviousPass =
      pass.index > 0 && start === pass.start && timelineEnd >= pass.end;
    // Offset and duration are buffer seconds, so the slice ends exactly at the
    // audio-clock time where the next pass's slice starts.
    this.player.start({
      buffer,
      playbackRate: pass.playbackRate,
      time: getPassContextTime(pass, start),
      offset: start - timelineOffset,
      duration: end - start,
      fadeIn: !continuesPreviousPass,
    });
  }
}

/** One buffer source and its fade, from start until it ends. */
type DeclickedSource = {
  node: AudioBufferSourceNode;
  envelope: DeclickGain;
  /** Resolves once the source has ended and been disconnected. */
  ended: Promise<void>;
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
    fadeIn,
  }: {
    buffer: AudioBuffer;
    playbackRate: number;
    time: number;
    offset: number;
    duration: number;
    fadeIn: boolean;
  }): void {
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = playbackRate;
    const envelope = new DeclickGain(this.context);
    envelope.open(time, { fadeIn });
    node.connect(envelope.node).connect(this.output);
    // Disconnect after the fade has rendered, not when stop() is called.
    const ended = new Promise<void>((resolve) => {
      node.onended = () => {
        node.disconnect();
        envelope.node.disconnect();
        this.sources.delete(source);
        resolve();
      };
    });
    const source: DeclickedSource = { node, envelope, ended, stopped: false };
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

  /** Resolves once every source started so far has ended. */
  async waitForSilence(): Promise<void> {
    await Promise.all([...this.sources].map((source) => source.ended));
  }
}
