import { describe, expect, it, vi } from "vitest";
import type { Note } from "../../types.ts";
import { UndoRedoHistory } from "./history.ts";

describe(UndoRedoHistory, () => {
  it("replays note groups in chronological order across tracks", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    const first = [note("a"), note("b")];
    const moved = first.map((note) => ({ ...note, start: note.start + 2 }));
    const second = [note("c")];
    history.push(notesEntry({ trackId: "first", before: [], after: first }));
    history.push(notesEntry({ trackId: "first", before: first, after: moved }));
    history.push(notesEntry({ trackId: "second", before: [], after: second }));
    const apply = vi.fn();

    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { type: "midi-notes", trackId: "second", notes: [] },
      { type: "midi-notes", trackId: "first", notes: first },
      { type: "midi-notes", trackId: "first", notes: [] },
    ]);

    apply.mockClear();
    history.redo(apply);
    history.redo(apply);
    history.redo(apply);
    history.redo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { type: "midi-notes", trackId: "first", notes: first },
      { type: "midi-notes", trackId: "first", notes: moved },
      { type: "midi-notes", trackId: "second", notes: second },
    ]);
  });

  it("discards redo after a new edit", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    const apply = vi.fn();
    history.push(
      notesEntry({ trackId: "track", before: [], after: [note("a")] }),
    );
    history.undo(apply);
    history.push(
      notesEntry({ trackId: "track", before: [], after: [note("b")] }),
    );
    apply.mockClear();
    history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
    history.undo(apply);
    history.redo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [note("b")],
    });
  });

  it("prunes a deleted track from both stacks while keeping other tracks", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    const apply = vi.fn();
    for (const trackId of ["keep", "remove", "keep", "remove"]) {
      history.push(notesEntry({ trackId, before: [], after: [note(trackId)] }));
    }
    history.undo(apply);
    history.prune(
      (entry) =>
        entry.before.type === "midi-notes" && entry.before.trackId === "remove",
    );
    apply.mockClear();
    history.redo(apply);
    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { type: "midi-notes", trackId: "keep", notes: [] },
      { type: "midi-notes", trackId: "keep", notes: [] },
    ]);
  });

  it("keeps the most recent 50 edits", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    const apply = vi.fn();
    for (let index = 0; index < 51; index++) {
      history.push(
        notesEntry({
          trackId: "track",
          before: [note(String(index))],
          after: [],
        }),
      );
    }
    for (let index = 0; index < 51; index++) {
      history.undo(apply);
    }
    expect(apply).toHaveBeenCalledTimes(50);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [note("1")],
    });
  });

  it("clears both stacks on project replacement", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    const apply = vi.fn();
    history.push(
      notesEntry({ trackId: "track", before: [], after: [note("a")] }),
    );
    history.push(
      notesEntry({ trackId: "track", before: [note("a")], after: [] }),
    );
    history.undo(apply);
    history.clear();
    apply.mockClear();
    history.undo(apply);
    history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("keeps the entry available when replay fails", () => {
    const history = new UndoRedoHistory<
      ReturnType<typeof notesEntry>["before"]
    >();
    history.push(
      notesEntry({ trackId: "track", before: [], after: [note("a")] }),
    );
    const fail = () => {
      throw new Error("replay failed");
    };
    expect(() => history.undo(fail)).toThrow("replay failed");
    const apply = vi.fn();
    history.undo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      type: "midi-notes",
      trackId: "track",
      notes: [],
    });
    expect(() => history.redo(fail)).toThrow("replay failed");
    history.redo(apply);
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

function notesEntry({
  trackId,
  before,
  after,
}: {
  trackId: string;
  before: Note[];
  after: Note[];
}) {
  return {
    before: { type: "midi-notes" as const, trackId, notes: before },
    after: { type: "midi-notes" as const, trackId, notes: after },
  };
}
