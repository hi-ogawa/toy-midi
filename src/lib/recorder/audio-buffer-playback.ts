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
 * Plays one clip region as a series of one-shot source "voices", one per loop
 * pass the region intersects. Each voice ends itself exactly where the next
 * pass begins, so a loop wrap needs no stop and restart.
 */
export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private playbackSource?: AudioPlaybackSource;
  /** Voices queued or sounding, removed once they end. */
  private readonly voices = new Set<AudioBufferSourceNode>();
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

  /** Stops sounding voices and cancels voices queued for later passes. */
  stop(): void {
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
  }

  dispose(): void {
    this.unregister();
    this.gain.disconnect();
  }

  /** Queues a voice for each loop pass that begins during the window. */
  private schedule(window: ContextTimeWindow): void {
    const playbackRun = this.transport.playbackRun!;
    for (const segment of getPlaybackSegments(playbackRun, window)) {
      if (segment.index < this.nextSegmentIndex) {
        continue;
      }
      this.nextSegmentIndex = segment.index + 1;
      this.startVoice(segment);
    }
  }

  /** Plays the part of the region inside one segment, region ∩ segment. */
  private startVoice(segment: PlaybackSegment): void {
    const context = this.transport.context;
    const { buffer, timelineOffset, timelineStart, timelineEnd } =
      this.playbackSource!;
    // Join mid-region at the playhead, or at the current time if a stalled
    // timer let the segment begin before its voice was queued.
    const start = Math.max(
      timelineStart,
      segment.start,
      getSegmentPosition(segment, context.currentTime),
    );
    const end = Math.min(timelineEnd, segment.end);
    if (start >= end) {
      return;
    }
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.playbackRate.value = segment.playbackRate;
    voice.connect(this.gain);
    voice.onended = () => {
      voice.disconnect();
      this.voices.delete(voice);
    };
    // Offset and duration are buffer seconds, so the voice ends exactly at the
    // audio-clock time where the next segment's voice starts.
    voice.start(
      getSegmentContextTime(segment, start),
      start - timelineOffset,
      end - start,
    );
    this.voices.add(voice);
  }
}
