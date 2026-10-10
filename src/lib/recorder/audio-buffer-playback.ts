import { DeclickGain } from "../dsp/declick-gain.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import {
  type ContextTimeWindow,
  getPlaybackSegments,
  getSegmentContextTime,
  getSegmentPosition,
  type PlaybackSegment,
} from "./playback-segments.ts";
import {
  type AudioContextTransport,
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
  private nextSegmentIndex = 0;
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
    this.nextSegmentIndex = 0;
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

  /** Queues a slice for each loop pass that begins during the window. */
  private schedule(window: ContextTimeWindow): void {
    const playbackRun = this.transport.playbackRun!;
    for (const segment of getPlaybackSegments(playbackRun, window)) {
      if (segment.index < this.nextSegmentIndex) {
        continue;
      }
      this.nextSegmentIndex = segment.index + 1;
      this.startSlice(segment);
    }
  }

  /** Plays the part of the region inside one segment, region ∩ segment. */
  private startSlice(segment: PlaybackSegment): void {
    const { buffer, timelineOffset, timelineStart, timelineEnd } =
      this.playbackSource!;
    // Join mid-region at the playhead, or at the current time if a stalled
    // timer let the segment begin before its slice was queued.
    const start = Math.max(
      timelineStart,
      segment.start,
      getSegmentPosition(segment, this.transport.context.currentTime),
    );
    const end = Math.min(timelineEnd, segment.end);
    if (start >= end) {
      return;
    }
    // A later pass that enters at loop-in while the region also covers
    // loop-out continues the previous pass's slice, which ends at this same
    // instant, so fading in would dip the splice.
    const continuesPreviousPass =
      segment.index > 0 &&
      start === segment.start &&
      timelineEnd >= segment.end;
    // Offset and duration are buffer seconds, so the slice ends exactly at the
    // audio-clock time where the next segment's slice starts.
    this.player.start({
      buffer,
      playbackRate: segment.playbackRate,
      time: getSegmentContextTime(segment, start),
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

  /**
   * Plays `duration` buffer seconds from `offset`, starting at audio-clock
   * `time`. Without `fadeIn`, it starts at full level, for a slice that
   * continues one ending at the same instant.
   */
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
    if (fadeIn) {
      envelope.open(time);
    } else {
      envelope.openImmediately(time);
    }
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
