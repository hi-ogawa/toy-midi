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
 * Turns a track's notes into audio-clock note events for consecutive windows of
 * one playback run, each note start exactly once.
 */
export class MidiNoteScheduler {
  /** Sorted by start. */
  private notes: TimelineNote[] = [];
  private run?: PlaybackRun;
  private scheduledUntil = 0;

  setNotes(notes: TimelineNote[]): void {
    this.notes = notes;
  }

  start(run: PlaybackRunOptions): void {
    this.run = new PlaybackRun(run);
    this.scheduledUntil = this.run.firstPass.contextTime;
  }

  stop(): void {
    this.run = undefined;
  }

  /**
   * Notes starting from where the previous call left off up to `end`. A start
   * that arrives after its run should have begun skips the part already in the
   * past rather than playing it late.
   */
  takeNotes({ now, end }: { now: number; end: number }): ScheduledNote[] {
    const run = this.run;
    if (!run || end <= this.scheduledUntil) {
      return [];
    }
    const window = { start: Math.max(this.scheduledUntil, now), end };
    this.scheduledUntil = end;
    const scheduled: ScheduledNote[] = [];
    for (const range of run.getScheduledRanges(window)) {
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
