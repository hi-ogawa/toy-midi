import { describe, expect, it, vi } from "vitest";
import type { Note } from "../../types.ts";
import { RecorderHistory } from "./history.ts";

describe(RecorderHistory, () => {
  it("replays note groups in chronological order across tracks", async () => {
    const history = new RecorderHistory();
    const first = [note("a"), note("b")];
    const moved = first.map((note) => ({ ...note, start: note.start + 2 }));
    const second = [note("c")];
    pushNotes(history, { trackId: "first", before: [], after: first });
    pushNotes(history, { trackId: "first", before: first, after: moved });
    pushNotes(history, { trackId: "second", before: [], after: second });
    const apply = vi.fn();

    await history.undo(apply);
    await history.undo(apply);
    await history.undo(apply);
    await history.undo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { type: "midi-notes", trackId: "second", notes: [] },
      { type: "midi-notes", trackId: "first", notes: first },
      { type: "midi-notes", trackId: "first", notes: [] },
    ]);

    apply.mockClear();
    await history.redo(apply);
    await history.redo(apply);
    await history.redo(apply);
    await history.redo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { type: "midi-notes", trackId: "first", notes: first },
      { type: "midi-notes", trackId: "first", notes: moved },
      { type: "midi-notes", trackId: "second", notes: second },
    ]);
  });

  it("discards redo after a new edit", async () => {
    const history = new RecorderHistory();
    const apply = vi.fn();
    pushNotes(history, { trackId: "track", before: [], after: [note("a")] });
    await history.undo(apply);
    pushNotes(history, { trackId: "track", before: [], after: [note("b")] });
    apply.mockClear();
    await history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
    await history.undo(apply);
    await history.redo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [note("b")],
    });
  });

  it("keeps the most recent 50 edits", async () => {
    const history = new RecorderHistory();
    const apply = vi.fn();
    for (let index = 0; index < 51; index++) {
      pushNotes(history, {
        trackId: "track",
        before: [note(String(index))],
        after: [],
      });
    }
    for (let index = 0; index < 51; index++) {
      await history.undo(apply);
    }
    expect(apply).toHaveBeenCalledTimes(50);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [note("1")],
    });
  });

  it("clears both stacks on project replacement", async () => {
    const history = new RecorderHistory();
    const apply = vi.fn();
    pushNotes(history, { trackId: "track", before: [], after: [note("a")] });
    pushNotes(history, { trackId: "track", before: [note("a")], after: [] });
    await history.undo(apply);
    history.clear();
    apply.mockClear();
    await history.undo(apply);
    await history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("keeps the entry available when replay fails", async () => {
    const history = new RecorderHistory();
    pushNotes(history, { trackId: "track", before: [], after: [note("a")] });
    const fail = async () => {
      throw new Error("replay failed");
    };
    await expect(history.undo(fail)).rejects.toThrow("replay failed");
    const apply = vi.fn();
    await history.undo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [],
    });
    await expect(history.redo(fail)).rejects.toThrow("replay failed");
    await history.redo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [note("a")],
    });
  });
});

function note(id: string): Note {
  return { id, pitch: 60, start: 1, duration: 0.25, velocity: 100 };
}

function pushNotes(
  history: RecorderHistory,
  {
    trackId,
    before,
    after,
  }: { trackId: string; before: Note[]; after: Note[] },
) {
  history.push({
    before: { type: "midi-notes", trackId, notes: before },
    after: { type: "midi-notes", trackId, notes: after },
  });
}
