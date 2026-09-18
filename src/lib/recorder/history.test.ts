import { describe, expect, it, vi } from "vitest";
import type { Note } from "../../types.ts";
import { RecorderMidiHistory } from "./history.ts";

describe(RecorderMidiHistory, () => {
  it("replays note groups in chronological order across tracks", () => {
    const history = new RecorderMidiHistory();
    const first = [note("a"), note("b")];
    const moved = first.map((note) => ({ ...note, start: note.start + 2 }));
    const second = [note("c")];
    history.push({ trackId: "first", before: [], after: first });
    history.push({ trackId: "first", before: first, after: moved });
    history.push({ trackId: "second", before: [], after: second });
    const apply = vi.fn();

    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { trackId: "second", notes: [] },
      { trackId: "first", notes: first },
      { trackId: "first", notes: [] },
    ]);

    apply.mockClear();
    history.redo(apply);
    history.redo(apply);
    history.redo(apply);
    history.redo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { trackId: "first", notes: first },
      { trackId: "first", notes: moved },
      { trackId: "second", notes: second },
    ]);
  });

  it("discards redo after a new edit", () => {
    const history = new RecorderMidiHistory();
    const apply = vi.fn();
    history.push({ trackId: "track", before: [], after: [note("a")] });
    history.undo(apply);
    history.push({ trackId: "track", before: [], after: [note("b")] });
    apply.mockClear();
    history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
    history.undo(apply);
    history.redo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      trackId: "track",
      notes: [note("b")],
    });
  });

  it("prunes a deleted track from both stacks while keeping other tracks", () => {
    const history = new RecorderMidiHistory();
    const apply = vi.fn();
    for (const trackId of ["keep", "remove", "keep", "remove"]) {
      history.push({ trackId, before: [], after: [note(trackId)] });
    }
    history.undo(apply);
    history.removeTrack("remove");
    apply.mockClear();
    history.redo(apply);
    history.undo(apply);
    history.undo(apply);
    history.undo(apply);
    expect(apply.mock.calls.map(([change]) => change)).toEqual([
      { trackId: "keep", notes: [] },
      { trackId: "keep", notes: [] },
    ]);
  });

  it("keeps the most recent 50 edits", () => {
    const history = new RecorderMidiHistory();
    const apply = vi.fn();
    for (let index = 0; index < 51; index++) {
      history.push({
        trackId: "track",
        before: [note(String(index))],
        after: [],
      });
    }
    for (let index = 0; index < 51; index++) {
      history.undo(apply);
    }
    expect(apply).toHaveBeenCalledTimes(50);
    expect(apply).toHaveBeenLastCalledWith({
      trackId: "track",
      notes: [note("1")],
    });
  });

  it("clears both stacks on project replacement", () => {
    const history = new RecorderMidiHistory();
    const apply = vi.fn();
    history.push({ trackId: "track", before: [], after: [note("a")] });
    history.push({ trackId: "track", before: [note("a")], after: [] });
    history.undo(apply);
    history.clear();
    apply.mockClear();
    history.undo(apply);
    history.redo(apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("keeps the entry available when replay fails", () => {
    const history = new RecorderMidiHistory();
    history.push({ trackId: "track", before: [], after: [note("a")] });
    const fail = () => {
      throw new Error("replay failed");
    };
    expect(() => history.undo(fail)).toThrow("replay failed");
    const apply = vi.fn();
    history.undo(apply);
    expect(apply).toHaveBeenLastCalledWith({ trackId: "track", notes: [] });
    expect(() => history.redo(fail)).toThrow("replay failed");
    history.redo(apply);
    expect(apply).toHaveBeenLastCalledWith({
      trackId: "track",
      notes: [note("a")],
    });
  });
});

function note(id: string): Note {
  return { id, pitch: 60, start: 1, duration: 0.25, velocity: 100 };
}
