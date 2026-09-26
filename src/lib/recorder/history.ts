import type { Note } from "../../types.ts";
import type {
  MidiTrackState,
  RecorderClipInsertRemove,
  RecorderClipInsertRemoveSnapshot,
  RecorderRuntime,
} from "./runtime.ts";

// TODO: Reduce snapshot memory by recording only affected notes through a runtime API:
// editMidiTrackNotes({ trackId, upsert: changedOrAddedNotes, remove: deletedNoteIds }).
// Capture complete before/after notes for those IDs and migrate callers incrementally.
// Keep full snapshots for setMidiTrackNotes replacements such as transcription, and
// preserve array ordering when undo restores deleted notes.

// TODO: Coordinate async replay with overlapping undo/redo, edits, and project loading.

/** A state change that runtime can apply directly, including during undo and redo. */
type RecorderChange =
  | { type: "midi-notes"; trackId: string; notes: Note[] }
  | {
      type: "midi-track-insert";
      track: MidiTrackState;
      orderIndex: number;
    }
  | { type: "midi-track-delete"; trackId: string }
  | ({ type: "clips" } & RecorderClipInsertRemove);

export class RecorderHistory {
  private history = new UndoRedoHistory<RecorderChange>();

  constructor(private runtime: RecorderRuntime) {}

  pushMidiNotes(trackId: string, before: Note[], after: Note[]): void {
    this.history.push({
      before: { type: "midi-notes", trackId, notes: before },
      after: { type: "midi-notes", trackId, notes: after },
    });
  }

  pushMidiTrack({
    track,
    orderIndex,
    reverse = false,
  }: {
    track: MidiTrackState;
    orderIndex: number;
    reverse?: boolean;
  }): void {
    const before: RecorderChange = {
      type: "midi-track-delete",
      trackId: track.id,
    };
    const after: RecorderChange = {
      type: "midi-track-insert",
      track,
      orderIndex,
    };
    this.history.push(
      reverse ? { before: after, after: before } : { before, after },
    );
  }

  pushClips({
    snapshot,
    reverse = false,
  }: {
    snapshot: RecorderClipInsertRemoveSnapshot;
    reverse?: boolean;
  }): void {
    const before: RecorderChange = {
      type: "clips",
      operation: "remove",
      snapshot,
    };
    const after: RecorderChange = {
      type: "clips",
      operation: "insert",
      snapshot,
    };
    this.history.push(
      reverse ? { before: after, after: before } : { before, after },
    );
  }

  private async apply(change: RecorderChange): Promise<void> {
    switch (change.type) {
      case "midi-notes": {
        this.runtime.applyMidiTrackNotes(change.trackId, change.notes);
        break;
      }
      case "midi-track-insert": {
        await this.runtime.insertMidiTrack(change);
        break;
      }
      case "midi-track-delete": {
        this.runtime.deleteMidiTrack(change.trackId);
        break;
      }
      case "clips": {
        this.runtime.applyClipInsertRemove(change);
        break;
      }
    }
  }

  clear = () => this.history.clear();
  undo = () => this.history.undo((change) => this.apply(change));
  redo = () => this.history.redo((change) => this.apply(change));
}

/** One committed edit, with changes that restore its previous and resulting state. */
type HistoryEntry<T> = {
  before: T;
  after: T;
};

/**
 * Restore the described state and its runtime effects without recording
 * another history entry. If this throws or rejects, history keeps the entry on its original
 * stack, but cannot roll back any state the callback already changed.
 */
type ApplyChange<T> = (change: T) => void | Promise<void>;

const MAX_HISTORY = 50;

/**
 * A chronological undo/redo history of caller-defined changes.
 * The caller owns applying changes. History stores values of T and passes them to the apply callback,
 * so entries and their referenced data must not be mutated after push or replay.
 */
class UndoRedoHistory<T> {
  private undoStack: HistoryEntry<T>[] = [];
  private redoStack: HistoryEntry<T>[] = [];

  /**
   * Record one edit after the caller has successfully applied it. Does not apply
   * either change or detect no-ops. Clears redo and retains the latest 50 edits.
   */
  push(entry: HistoryEntry<T>): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Await apply(entry.before) for the latest edit, then move the entry to redo.
   * An empty stack is a no-op. A thrown error or rejection propagates without moving the entry.
   */
  async undo(apply: ApplyChange<T>): Promise<void> {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.before);
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  /**
   * Await apply(entry.after) for the latest undone edit, then move the entry to undo.
   * An empty stack is a no-op. A thrown error or rejection propagates without moving the entry.
   */
  async redo(apply: ApplyChange<T>): Promise<void> {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  /** Forget both stacks without changing application state, for example on project load. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
