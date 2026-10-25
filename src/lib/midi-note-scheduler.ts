import { findSortedIndex } from "../utils/array.ts";
import {
  type ContextTimeWindow,
  PlaybackRun,
  type PlaybackRunOptions,
  type ScheduledRange,
} from "./playback-run.ts";

/** A note on the timeline, in seconds. */
export type TimelineNote = {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
};

/** An automation sequence on the timeline, in seconds, with bends in semitones. */
export type TimelineAutomation = (
  | { type: "controller"; controller: number }
  | { type: "pitch-bend" }
) & {
  /** Sorted by time */
  points: { time: number; value: number }[];
};

/**
 * A sequence with values as the synth takes them, and the value it has before
 * its first point.
 */
export type ScheduledAutomation = TimelineAutomation & { initialValue: number };

/** A synth event placed on the audio clock. */
export type ScheduledEvent =
  | { type: "note-on"; time: number; pitch: number; velocity: number }
  | { type: "note-off"; time: number; pitch: number }
  | { type: "controller"; time: number; controller: number; value: number }
  | { type: "pitch-bend"; time: number; value: number };

/**
 * Places a track's notes and controller changes on the audio clock for windows
 * of a playback run. Consecutive windows take each note and point exactly once.
 */
export class MidiNoteScheduler {
  /** Sorted by start. */
  private notes: TimelineNote[] = [];
  private automation: ScheduledAutomation[] = [];
  private playbackRun?: PlaybackRun;
  // The next pass `scheduleChase` runs for. 0 runs it in the next window.
  private nextChasePassIndex = 0;

  setNotes(notes: TimelineNote[]): void {
    this.notes = notes;
  }

  setAutomation(automation: ScheduledAutomation[]): void {
    this.automation = automation;
    this.requestChase();
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    this.playbackRun = new PlaybackRun(playbackRunOptions);
    this.requestChase();
  }

  /** Sends every sequence's value at the playhead again, from the next window. */
  requestChase(): void {
    this.nextChasePassIndex = 0;
  }

  stop(): void {
    this.playbackRun = undefined;
  }

  /** Events in the window, none before the run begins. */
  getScheduledEvents(window: ContextTimeWindow): ScheduledEvent[] {
    const playbackRun = this.playbackRun;
    if (!playbackRun) {
      return [];
    }
    const scheduled: ScheduledEvent[] = [];
    for (const range of playbackRun.getScheduledRanges(window)) {
      if (this.nextChasePassIndex <= range.pass.index) {
        this.nextChasePassIndex = range.pass.index + 1;
        this.scheduleChase(range, scheduled);
      }
      this.scheduleNotes(range, scheduled);
      this.scheduleControllers(range, scheduled);
    }
    return scheduled;
  }

  /**
   * Sends each sequence's value at the range start, as if playback had run from
   * the top, because a controller holds its value until the next point. This is
   * what DAWs call chasing. It runs at every pass start, loop wraps included, so
   * each pass sounds like a straight play-through and like Export Audio. The
   * alternative is to carry values across a wrap, so a repeat starts from the
   * values at loop-out. Logic makes chasing at a wrap an option ("Chase on Cycle
   * Jump"), but Toy MIDI has no preference for it.
   * https://help.apple.com/logicpro/mac/10.1/en.lproj/lgcp621f927c.html
   */
  private scheduleChase(
    range: ScheduledRange,
    scheduled: ScheduledEvent[],
  ): void {
    const time = range.pass.getContextTimeAt(range.start);
    for (const sequence of this.automation) {
      const { points, initialValue } = sequence;
      const index =
        findSortedIndex(points, (point) => point.time >= range.start) - 1;
      scheduled.push(
        createAutomationEvent(
          sequence,
          time,
          index >= 0 ? points[index].value : initialValue,
        ),
      );
    }
  }

  private scheduleNotes(
    range: ScheduledRange,
    scheduled: ScheduledEvent[],
  ): void {
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
      scheduled.push(
        {
          type: "note-on",
          time: range.pass.getContextTimeAt(note.start),
          pitch: note.pitch,
          velocity: note.velocity,
        },
        {
          type: "note-off",
          time: range.pass.getContextTimeAt(noteEnd),
          pitch: note.pitch,
        },
      );
    }
  }

  private scheduleControllers(
    range: ScheduledRange,
    scheduled: ScheduledEvent[],
  ): void {
    for (const sequence of this.automation) {
      const { points } = sequence;
      for (
        let index = findSortedIndex(
          points,
          (point) => point.time >= range.start,
        );
        index < points.length && points[index].time < range.end;
        index++
      ) {
        const point = points[index];
        scheduled.push(
          createAutomationEvent(
            sequence,
            range.pass.getContextTimeAt(point.time),
            point.value,
          ),
        );
      }
    }
  }
}

function createAutomationEvent(
  sequence: ScheduledAutomation,
  time: number,
  value: number,
): ScheduledEvent {
  switch (sequence.type) {
    case "controller": {
      return {
        type: "controller",
        time,
        controller: sequence.controller,
        value,
      };
    }
    case "pitch-bend": {
      return { type: "pitch-bend", time, value };
    }
  }
}
