import { useEffect, useState } from "react";
import { clamp } from "../../lib/music";
import {
  MIN_CLIP_DURATION,
  trimAudioClip,
  type AudioClip,
} from "../../lib/recorder/audio-clip";
import { deriveClipRegions } from "../../lib/recorder/clip-regions";
import {
  type RecorderClipId,
  type RecorderClipMove,
  type RecorderClipTrim,
  type AudioTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";

type ClipEditStart =
  | { type: "move"; clip: RecorderClipId; additive: boolean }
  | {
      type: "trim";
      clip: Extract<RecorderClipId, { type: "clip" }>;
      edge: "start" | "end";
      additive: boolean;
    };

type ClipEdit =
  | {
      type: "move";
      changes: RecorderClipMove[];
      getChanges: (delta: number) => RecorderClipMove[];
    }
  | {
      type: "trim";
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
    return (
      edit?.changes.some(
        (change) => change.type === "clip" && change.id === id,
      ) ?? false
    );
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
    switch (input.type) {
      case "move": {
        const clips: RecorderClipMove[] = [
          ...selected.clips.map((clip) => ({
            type: "clip" as const,
            id: clip.id,
            timelineOffset: clip.timelineOffset,
          })),
          ...(selected.referenceVideo
            ? [
                {
                  type: "reference" as const,
                  timelineOffset: selected.referenceVideo.timelineStart,
                },
              ]
            : []),
        ];
        const getChanges = createMoveGetChanges({
          clips,
          minimumVisibleStart: Math.min(
            ...selected.clips.map(
              (clip) => clip.timelineOffset + clip.trimStart,
            ),
            ...(selected.referenceVideo
              ? [selected.referenceVideo.timelineStart]
              : []),
          ),
        });
        setEdit({ type: "move", changes: clips, getChanges });
        break;
      }
      case "trim": {
        if (!selected.clips.some((clip) => clip.id === input.clip.id)) {
          throw new Error("Recorder clip state is missing.");
        }
        const getChanges = createTrimGetChanges({
          clips: selected.clips,
          edge: input.edge,
        });
        setEdit({ type: "trim", changes: getChanges(0), getChanges });
        break;
      }
    }
  }

  function updateEdit(delta: number): void {
    if (!edit) {
      return;
    }
    switch (edit.type) {
      case "move": {
        setEdit({ ...edit, changes: edit.getChanges(delta) });
        break;
      }
      case "trim": {
        setEdit({ ...edit, changes: edit.getChanges(delta) });
        break;
      }
    }
  }

  function finishEdit(delta: number): void {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    switch (edit.type) {
      case "move": {
        runtime.moveClips(edit.getChanges(delta));
        break;
      }
      case "trim": {
        // TODO: Commit bulk trims in one runtime mutation so state and playback update atomically.
        for (const change of edit.getChanges(delta)) {
          runtime.trimClip(change);
        }
        break;
      }
    }
  }

  function previewTrack(track: AudioTrackState): AudioTrackState {
    if (!edit) {
      return track;
    }
    const moves = edit.type === "move" ? edit.changes : [];
    const trims = edit.type === "trim" ? edit.changes : [];
    const clips = track.clips.map((clip) => {
      const trim = trims.find((trim) => trim.id === clip.id);
      if (trim) {
        return trimAudioClip({ clip, edge: trim.edge, value: trim.value });
      }
      const move = moves.find(
        (move) => move.type === "clip" && move.id === clip.id,
      );
      return move ? { ...clip, timelineOffset: move.timelineOffset } : clip;
    });
    if (clips.every((clip, index) => clip === track.clips[index])) {
      return track;
    }
    const soloed = clips.some((clip) => clip.soloed);
    return {
      ...track,
      clips,
      regions: deriveClipRegions(
        clips.filter((clip) => !clip.muted && (!soloed || clip.soloed)),
      ),
    };
  }

  function previewReferenceVideo() {
    const { referenceVideo } = state;
    const move =
      edit?.type === "move"
        ? edit.changes.find((change) => change.type === "reference")
        : undefined;
    return referenceVideo && move
      ? { ...referenceVideo, timelineStart: move.timelineOffset }
      : referenceVideo;
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

  return {
    audioTracks: state.audioTracks.map(previewTrack),
    recordingTrack: previewTrack(state.recordingTrack),
    referenceVideo: previewReferenceVideo(),
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
  minimumVisibleStart,
}: {
  clips: RecorderClipMove[];
  minimumVisibleStart: number;
}): (delta: number) => RecorderClipMove[] {
  return (delta) => {
    const clampedDelta = Math.max(delta, -minimumVisibleStart);
    return clips.map((clip) => ({
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
      type: "clip",
      id: clip.id,
      edge,
      value: (edge === "start" ? clip.trimStart : clip.trimEnd) + clampedDelta,
    }));
  };
}
