import { describe, expect, it, vi } from "vitest";
import { RecorderHistory } from "./history.ts";

describe("RecorderHistory", () => {
  it("moves closure pairs between undo and redo", () => {
    const history = new RecorderHistory();
    const undo = vi.fn();
    const redo = vi.fn();

    history.push({ undo, redo });
    history.undo();
    history.redo();

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
  });

  it("clears redo when a new operation is pushed", () => {
    const history = new RecorderHistory();
    const redo = vi.fn();

    history.push({ undo: vi.fn(), redo });
    history.undo();
    history.push({ undo: vi.fn(), redo: vi.fn() });
    history.redo();

    expect(redo).not.toHaveBeenCalled();
  });

  it("keeps an entry in place when applying it fails", () => {
    const history = new RecorderHistory();
    const undo = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error("undo failed");
      })
      .mockImplementationOnce(() => {});

    history.push({ undo, redo: vi.fn() });

    expect(() => history.undo()).toThrow("undo failed");
    history.undo();
    expect(undo).toHaveBeenCalledTimes(2);
  });
});
