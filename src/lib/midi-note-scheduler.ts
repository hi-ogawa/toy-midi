import type { Note } from "../types.ts";
import { findSortedIndex } from "../utils/array.ts";
import {
  type ContextTimeWindow,
  PlaybackRun,
  type PlaybackRunOptions,
} from "./playback-run.ts";
import { beatsToSeconds } from "./timeline.ts";

/** A note on the timeline, in seconds. */
export type TimelineNote = {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
};

/** Converts notes in beats to timeline notes, sorted by start. */
export function convertToTimelineNotes(
  notes: readonly Note[],
  tempo: number,
): TimelineNote[] {
  return notes
    .map((note) => ({
      start: beatsToSeconds(note.start, tempo),
      end: beatsToSeconds(note.start + note.duration, tempo),
      pitch: note.pitch,
      velocity: note.velocity,
    }))
    .sort((a, b) => a.start - b.start);
}

/** A note placed on the audio clock. */
export type ScheduledNote = {
  startTime: number;
  endTime: number;
  pitch: number;
  velocity: number;
};

/**
 * Places a track's notes on the audio clock for windows of a playback run.
 * Consecutive windows take each note exactly once.
 */
export class MidiNoteScheduler {
  /** Sorted by start. */
  private notes: TimelineNote[] = [];
  private playbackRun?: PlaybackRun;

  setNotes(notes: TimelineNote[]): void {
    this.notes = notes;
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    this.playbackRun = new PlaybackRun(playbackRunOptions);
  }

  stop(): void {
    this.playbackRun = undefined;
  }

  /** Notes starting in the window, none before the run begins. */
  getScheduledNotes(window: ContextTimeWindow): ScheduledNote[] {
    const playbackRun = this.playbackRun;
    if (!playbackRun) {
      return [];
    }
    const scheduled: ScheduledNote[] = [];
    for (const range of playbackRun.getScheduledRanges(window)) {
      for (
        let index = findSortedIndex(
          this.notes,
          (note) => note.start >= range.start,
        );
        index < this.notes.length && this.notes[index].start < range.end;
        index++
      ) {
        const note = this.notes[index];
        // A note held past loop-out ends at the wrap.
        const noteEnd = Math.min(note.end, range.pass.end);
        scheduled.push({
          startTime: range.pass.getContextTimeAt(note.start),
          endTime: range.pass.getContextTimeAt(noteEnd),
          pitch: note.pitch,
          velocity: note.velocity,
        });
      }
    }
    return scheduled;
  }
}
