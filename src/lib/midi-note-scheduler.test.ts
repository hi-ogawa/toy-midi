import { describe, expect, it } from "vitest";
import {
  MidiNoteScheduler,
  type ScheduledNote,
  type TimelineNote,
} from "./midi-note-scheduler.ts";

const BLOCK_SECONDS = 128 / 48000;

describe(MidiNoteScheduler, () => {
  it("takes each note once across render blocks", () => {
    const scheduler = new MidiNoteScheduler();
    scheduler.setNotes([note(0, 0.5), note(0.5, 1), note(1, 1.5)]);
    scheduler.start({ contextTime: 10, position: 0, playbackRate: 1 });
    expect(takeBlocks(scheduler, { from: 9.9, to: 11.2 })).toEqual([
      scheduled(10, 10.5),
      scheduled(10.5, 11),
      scheduled(11, 11.5),
    ]);
  });

  it("repeats notes on each loop pass and ends held notes at loop-out", () => {
    const scheduler = new MidiNoteScheduler();
    scheduler.setNotes([note(0, 0.5), note(0.5, 2)]);
    scheduler.start({
      contextTime: 0,
      position: 0,
      playbackRate: 1,
      loopRange: { start: 0, end: 1 },
    });
    expect(takeBlocks(scheduler, { from: 0, to: 2.9 })).toEqual([
      scheduled(0, 0.5),
      scheduled(0.5, 1),
      scheduled(1, 1.5),
      scheduled(1.5, 2),
      scheduled(2, 2.5),
      scheduled(2.5, 3),
    ]);
  });

  it("follows the playback rate", () => {
    const scheduler = new MidiNoteScheduler();
    scheduler.setNotes([note(2, 3)]);
    scheduler.start({ contextTime: 0, position: 1, playbackRate: 2 });
    expect(takeBlocks(scheduler, { from: 0, to: 1 })).toEqual([
      scheduled(0.5, 1),
    ]);
  });

  it("skips notes a late start has already passed", () => {
    const scheduler = new MidiNoteScheduler();
    scheduler.setNotes([note(0, 1), note(0.5, 1)]);
    scheduler.start({ contextTime: 0, position: 0, playbackRate: 1 });
    expect(scheduler.takeNotes({ now: 0.2, end: 1 })).toEqual([
      scheduled(0.5, 1),
    ]);
  });

  it("takes nothing after stop", () => {
    const scheduler = new MidiNoteScheduler();
    scheduler.setNotes([note(0, 1)]);
    scheduler.start({ contextTime: 0, position: 0, playbackRate: 1 });
    scheduler.stop();
    expect(scheduler.takeNotes({ now: 0, end: 1 })).toEqual([]);
  });
});

function takeBlocks(
  scheduler: MidiNoteScheduler,
  { from, to }: { from: number; to: number },
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  for (let now = from; now < to; now += BLOCK_SECONDS) {
    notes.push(...scheduler.takeNotes({ now, end: now + BLOCK_SECONDS }));
  }
  return notes.map((note) => ({
    ...note,
    startTime: round(note.startTime),
    endTime: round(note.endTime),
  }));
}

function note(start: number, end: number): TimelineNote {
  return { start, end, pitch: 60, velocity: 100 };
}

function scheduled(startTime: number, endTime: number): ScheduledNote {
  return { startTime, endTime, pitch: 60, velocity: 100 };
}

function round(time: number): number {
  return Math.round(time * 1e6) / 1e6;
}
