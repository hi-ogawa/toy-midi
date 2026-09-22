import { useEffect, useState } from "react";
import { clamp } from "../../lib/music";
import type { AudioClip } from "../../lib/recorder/audio-clip";
import {
  deriveClipEditState,
  MIN_CLIP_DURATION,
  REFERENCE_VIDEO_CLIP_ID,
  type RecorderClipMove,
  type RecorderClipTrim,
  type ReferenceVideoState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";

type ClipEditStart = {
  type: "move" | "trim-start" | "trim-end";
  id: string;
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
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());

  function getSelectedClips(editIds: ReadonlySet<string>) {
    return {
      clips: [...state.audioTracks, state.recordingTrack].flatMap((track) =>
        track.clips.filter((clip) => editIds.has(clip.id)),
      ),
      referenceVideo: editIds.has(REFERENCE_VIDEO_CLIP_ID)
        ? state.referenceVideo
        : undefined,
    };
  }

  // Remove stale selection IDs when clips or the reference video are removed outside this interaction.
  useEffect(() => {
    const available = new Set([
      ...[...state.audioTracks, state.recordingTrack].flatMap((track) =>
        track.clips.map((clip) => clip.id),
      ),
      ...(state.referenceVideo ? [REFERENCE_VIDEO_CLIP_ID] : []),
    ]);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.recordingTrack.clips, state.referenceVideo]);

  function isSelected(id: string): boolean {
    return selectedIds.has(id);
  }

  function isEditing(id: string): boolean {
    return edit?.changes.some((change) => change.id === id) ?? false;
  }

  function select(id: string, additive: boolean): void {
    onSelect();
    if (!additive) {
      const next = selectedIds.has(id) ? selectedIds : new Set([id]);
      setSelectedIds(next);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function startEdit(input: ClipEditStart): void {
    onSelect();
    const id = input.id;
    // Editing a selected clip preserves the group. Ctrl/Cmd adds an unselected
    // clip to the group, while an unmodified edit replaces the selection.
    const editIds = selectedIds.has(id)
      ? new Set(selectedIds)
      : input.additive
        ? new Set([...selectedIds, id])
        : new Set([id]);
    setSelectedIds(editIds);
    const selected = getSelectedClips(editIds);
    if (input.type === "move") {
      const getChanges = createMoveGetChanges(selected);
      setEdit({ type: "move", changes: getChanges(0), getChanges });
    } else {
      const getChanges =
        input.type === "trim-start"
          ? createTrimStartGetChanges(selected.clips)
          : createTrimEndGetChanges(selected.clips);
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

  function split(id: string): void {
    if (edit) {
      return;
    }
    const rightId = runtime.splitClip(id, runtime.store.get().position);
    if (rightId) {
      onSelect();
      setSelectedIds(new Set([rightId]));
    }
  }

  function splitSelected(): void {
    if (selectedIds.size === 1) {
      split([...selectedIds][0]!);
    }
  }

  function removeSelected(): void {
    setEdit(undefined);
    runtime.removeClips([...selectedIds]);
    setSelectedIds(new Set());
  }

  const preview = edit ? deriveClipEditState(state, edit) : state;

  return {
    audioTracks: preview.audioTracks,
    recordingTrack: preview.recordingTrack,
    referenceVideo: preview.referenceVideo,
    cancelEdit: () => setEdit(undefined),
    clear: () => {
      setEdit(undefined);
      setSelectedIds(new Set());
    },
    hasSelection: selectedIds.size > 0,
    isSelected,
    isEditing,
    select,
    startEdit,
    updateEdit,
    finishEdit,
    removeSelected,
    split,
    splitSelected,
    canSplit: (id: string) => !edit && runtime.canSplitClip(id, state.position),
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
      id: clip.id,
      timelineOffset: clip.timelineOffset,
    })),
    ...(referenceVideo
      ? [
          {
            id: REFERENCE_VIDEO_CLIP_ID,
            timelineOffset: referenceVideo.timelineStart,
          },
        ]
      : []),
  ];
  const minStart = Math.min(
    ...clips.map((clip) => clip.timelineOffset + clip.trimStart),
    ...(referenceVideo ? [referenceVideo.timelineStart] : []),
  );
  return (delta) => {
    const clampedDelta = Math.max(delta, -minStart);
    return originals.map((clip) => ({
      ...clip,
      timelineOffset: clip.timelineOffset + clampedDelta,
    }));
  };
}

function createTrimStartGetChanges(
  clips: AudioClip[],
): (delta: number) => RecorderClipTrim[] {
  const minStart = Math.min(...clips.map((clip) => clip.trimStart));
  const minDuration = Math.min(
    ...clips.map((clip) => clip.trimEnd - clip.trimStart),
  );
  return (delta) => {
    const clampedDelta = clamp(
      delta,
      -minStart,
      minDuration - MIN_CLIP_DURATION,
    );
    return clips.map((clip) => ({
      id: clip.id,
      value: clip.trimStart + clampedDelta,
    }));
  };
}

function createTrimEndGetChanges(
  clips: AudioClip[],
): (delta: number) => RecorderClipTrim[] {
  const minDuration = Math.min(
    ...clips.map((clip) => clip.trimEnd - clip.trimStart),
  );
  const minRemaining = Math.min(
    ...clips.map((clip) => clip.duration - clip.trimEnd),
  );
  return (delta) => {
    const clampedDelta = clamp(
      delta,
      -(minDuration - MIN_CLIP_DURATION),
      minRemaining,
    );
    return clips.map((clip) => ({
      id: clip.id,
      value: clip.trimEnd + clampedDelta,
    }));
  };
}
