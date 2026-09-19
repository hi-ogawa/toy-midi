import { useEffect, useState } from "react";
import { clamp } from "../../lib/music";
import type { AudioClip } from "../../lib/recorder/audio-clip";
import {
  deriveClipEditState,
  MIN_CLIP_DURATION,
  type RecorderClipId,
  type RecorderClipMove,
  type RecorderClipTrim,
  type ReferenceVideoState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";

type ClipEditStart =
  | { type: "move"; clip: RecorderClipId; additive: boolean }
  | {
      type: "trim-start" | "trim-end";
      clip: Extract<RecorderClipId, { type: "clip" }>;
      additive: boolean;
    };

type ClipEdit =
  | {
      type: "move";
      changes: RecorderClipMove[];
      getChanges: (delta: number) => RecorderClipMove[];
    }
  | {
      type: "trim-start" | "trim-end";
      changes: RecorderClipTrim[];
      getChanges: (delta: number) => RecorderClipTrim[];
    };

export function useRecorderClipInteraction({
  runtime,
  state,
  onSelect,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  /** Only coordinates selection domains by clearing selection in the other domain. */
  onSelect: () => void;
}) {
  const [edit, setEdit] = useState<ClipEdit>();
  const [keys, setKeys] = useState(() => new Set<string>());

  function getKey(clip: RecorderClipId): string {
    return clip.type === "reference" ? clip.type : `${clip.type}:${clip.id}`;
  }

  function getSelectedClips(selectedKeys: ReadonlySet<string>) {
    return {
      clips: [...state.audioTracks, state.recordingTrack].flatMap((track) =>
        track.clips.filter((clip) =>
          selectedKeys.has(getKey({ type: "clip", id: clip.id })),
        ),
      ),
      referenceVideo: selectedKeys.has(getKey({ type: "reference" }))
        ? state.referenceVideo
        : undefined,
    };
  }

  // Remove stale selection keys when clips or the reference video are removed outside this interaction.
  useEffect(() => {
    const available = new Set([
      ...[...state.audioTracks, state.recordingTrack].flatMap((track) =>
        track.clips.map((clip) => getKey({ type: "clip", id: clip.id })),
      ),
      ...(state.referenceVideo ? [getKey({ type: "reference" })] : []),
    ]);
    setKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.recordingTrack.clips, state.referenceVideo]);

  function isSelected(clip: RecorderClipId): boolean {
    return keys.has(getKey(clip));
  }

  function isEditing(id: string): boolean {
    if (!edit) {
      return false;
    }
    return edit.type === "move"
      ? edit.changes.some(
          (change) => change.type === "clip" && change.id === id,
        )
      : edit.changes.some((change) => change.id === id);
  }

  function select(clip: RecorderClipId, additive: boolean): void {
    onSelect();
    const key = getKey(clip);
    if (!additive) {
      const next = keys.has(key) ? keys : new Set([key]);
      setKeys(next);
      return;
    }
    const next = new Set(keys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setKeys(next);
  }

  function startEdit(input: ClipEditStart): void {
    onSelect();
    const key = getKey(input.clip);
    // Editing a selected clip preserves the group. Ctrl/Cmd adds an unselected
    // clip to the group, while an unmodified edit replaces the selection.
    const selectedKeys = keys.has(key)
      ? new Set(keys)
      : input.additive
        ? new Set([...keys, key])
        : new Set([key]);
    setKeys(selectedKeys);
    const selected = getSelectedClips(selectedKeys);
    if (input.type === "move") {
      const getChanges = createMoveGetChanges(selected);
      setEdit({ type: "move", changes: getChanges(0), getChanges });
    } else {
      const getChanges = createTrimGetChanges({
        clips: selected.clips,
        edge: input.type === "trim-start" ? "start" : "end",
      });
      setEdit({ type: input.type, changes: getChanges(0), getChanges });
    }
  }

  function updateEdit(delta: number): void {
    if (!edit) {
      return;
    }
    if (edit.type === "move") {
      setEdit({ ...edit, changes: edit.getChanges(delta) });
    } else {
      setEdit({ ...edit, changes: edit.getChanges(delta) });
    }
  }

  function finishEdit(delta: number): void {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    if (edit.type === "move") {
      runtime.commitClipEdit({
        type: edit.type,
        changes: edit.getChanges(delta),
      });
    } else {
      runtime.commitClipEdit({
        type: edit.type,
        changes: edit.getChanges(delta),
      });
    }
  }

  function removeSelected(): void {
    setEdit(undefined);
    const selected = getSelectedClips(keys);
    runtime.removeClips([
      ...selected.clips.map((clip) => ({
        type: "clip" as const,
        id: clip.id,
      })),
      ...(selected.referenceVideo ? [{ type: "reference" as const }] : []),
    ]);
    setKeys(new Set());
  }

  const preview = edit ? deriveClipEditState(state, edit) : state;

  return {
    audioTracks: preview.audioTracks,
    recordingTrack: preview.recordingTrack,
    referenceVideo: preview.referenceVideo,
    cancelEdit: () => setEdit(undefined),
    clear: () => {
      setEdit(undefined);
      setKeys(new Set());
    },
    hasSelection: keys.size > 0,
    isSelected,
    isEditing,
    select,
    startEdit,
    updateEdit,
    finishEdit,
    removeSelected,
  };
}

function createMoveGetChanges({
  clips,
  referenceVideo,
}: {
  clips: AudioClip[];
  referenceVideo?: ReferenceVideoState;
}): (delta: number) => RecorderClipMove[] {
  const originals: RecorderClipMove[] = [
    ...clips.map((clip) => ({
      type: "clip" as const,
      id: clip.id,
      timelineOffset: clip.timelineOffset,
    })),
    ...(referenceVideo
      ? [
          {
            type: "reference" as const,
            timelineOffset: referenceVideo.timelineStart,
          },
        ]
      : []),
  ];
  const minimumVisibleStart = Math.min(
    ...clips.map((clip) => clip.timelineOffset + clip.trimStart),
    ...(referenceVideo ? [referenceVideo.timelineStart] : []),
  );
  return (delta) => {
    const clampedDelta = Math.max(delta, -minimumVisibleStart);
    return originals.map((clip) => ({
      ...clip,
      timelineOffset: clip.timelineOffset + clampedDelta,
    }));
  };
}

function createTrimGetChanges({
  clips,
  edge,
}: {
  clips: AudioClip[];
  edge: "start" | "end";
}): (delta: number) => RecorderClipTrim[] {
  // Clamp one shared delta so every selected edge moves by the same amount.
  const minimumDelta = Math.max(
    ...clips.map((clip) =>
      edge === "start"
        ? -clip.trimStart
        : clip.trimStart + MIN_CLIP_DURATION - clip.trimEnd,
    ),
  );
  const maximumDelta = Math.min(
    ...clips.map((clip) =>
      edge === "start"
        ? clip.trimEnd - MIN_CLIP_DURATION - clip.trimStart
        : clip.duration - clip.trimEnd,
    ),
  );
  return (delta) => {
    const clampedDelta = clamp(delta, minimumDelta, maximumDelta);
    return clips.map((clip) => ({
      id: clip.id,
      value: (edge === "start" ? clip.trimStart : clip.trimEnd) + clampedDelta,
    }));
  };
}
