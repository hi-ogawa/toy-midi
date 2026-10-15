import { PlaybackRun, type PlaybackRunOptions } from "./playback-run.ts";

/** A note on the timeline, in seconds. */
export type TimelineNote = {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
};

/** A note placed on the audio clock. */
export type ScheduledNote = {
  pitch: number;
  velocity: number;
  startTime: number;
  endTime: number;
};

/**
 * Places a track's notes on the audio clock for consecutive windows of a
 * playback run, so each note starts exactly once.
 */
export class MidiNoteScheduler {
  /** Sorted by start. */
  private notes: TimelineNote[] = [];
  private playbackRun?: PlaybackRun;
  private scheduledUntil = 0;

  setNotes(notes: TimelineNote[]): void {
    this.notes = notes;
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    this.playbackRun = new PlaybackRun(playbackRunOptions);
    this.scheduledUntil = this.playbackRun.firstPass.contextTime;
  }

  stop(): void {
    this.playbackRun = undefined;
  }

  /**
   * Notes starting between the previous call's `end` and this one. When a run
   * starts later than it was meant to, notes already in the past are skipped
   * rather than played late.
   */
  takeNotes({ now, end }: { now: number; end: number }): ScheduledNote[] {
    const playbackRun = this.playbackRun;
    if (!playbackRun || end <= this.scheduledUntil) {
      return [];
    }
    const window = { start: Math.max(this.scheduledUntil, now), end };
    this.scheduledUntil = end;
    const scheduled: ScheduledNote[] = [];
    for (const range of playbackRun.getScheduledRanges(window)) {
      for (
        let index = findFirstNoteIndex(this.notes, range.start);
        index < this.notes.length && this.notes[index].start < range.end;
        index++
      ) {
        const note = this.notes[index];
        // A note held past loop-out ends at the wrap.
        const noteEnd = Math.min(note.end, range.pass.end);
        scheduled.push({
          pitch: note.pitch,
          velocity: note.velocity,
          startTime: range.pass.getContextTimeAt(note.start),
          endTime: range.pass.getContextTimeAt(noteEnd),
        });
      }
    }
    return scheduled;
  }
}

/** Index of the first note starting at or after `start`. */
function findFirstNoteIndex(notes: TimelineNote[], start: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (notes[middle].start < start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
