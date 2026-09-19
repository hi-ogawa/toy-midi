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
    };

type ClipEdit =
  | { type: "move"; snapshot: ClipMoveSnapshot; delta: number }
  | { type: "trim"; clips: AudioClip[]; edge: "start" | "end"; delta: number };

type ClipMoveSnapshot = {
  clips: RecorderClipMove[];
  minimumVisibleStart: number;
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
    switch (input.type) {
      case "move": {
        const draggedKey = getKey(input.clip);
        // Dragging a selected clip preserves the group; an unselected clip joins
        // with Ctrl/Cmd or replaces the selection otherwise.
        const selectedKeys = keys.has(draggedKey)
          ? new Set(keys)
          : input.additive
            ? new Set([...keys, draggedKey])
            : new Set([draggedKey]);
        setKeys(selectedKeys);
        const selected = getSelectedClips(selectedKeys);
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
        const snapshot: ClipMoveSnapshot = {
          clips,
          minimumVisibleStart: Math.min(
            ...selected.clips.map(
              (clip) => clip.timelineOffset + clip.trimStart,
            ),
            ...(selected.referenceVideo
              ? [selected.referenceVideo.timelineStart]
              : []),
          ),
        };
        setEdit({ type: "move", snapshot, delta: 0 });
        break;
      }
      case "trim": {
        const selected = [...state.audioTracks, state.recordingTrack]
          .flatMap((track) => track.clips)
          .find((entry) => entry.id === input.clip.id);
        if (!selected) {
          throw new Error("Recorder clip state is missing.");
        }
        // Trimming a selected clip preserves the group, just like moving it.
        const key = getKey(input.clip);
        if (!keys.has(key)) {
          setKeys(new Set([key]));
        }
        setEdit({
          type: "trim",
          clips: keys.has(key) ? getSelectedClips(keys).clips : [selected],
          edge: input.edge,
          delta: 0,
        });
        break;
      }
    }
  }

  function updateEdit(delta: number): void {
    if (edit) {
      setEdit({ ...edit, delta });
    }
  }

  function finishEdit(delta: number): void {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    switch (edit.type) {
      case "move": {
        const changes = getMoveChanges({ ...edit, delta });
        if (
          changes.some(
            (change, index) =>
              change.timelineOffset !==
              edit.snapshot.clips[index].timelineOffset,
          )
        ) {
          runtime.moveClips(changes);
        }
        break;
      }
      case "trim": {
        const clips = getTrimmedClips({ ...edit, delta });
        // TODO: Commit bulk trims in one runtime mutation so state and playback update atomically.
        for (const [index, clip] of clips.entries()) {
          const original = edit.clips[index];
          const value = edit.edge === "start" ? clip.trimStart : clip.trimEnd;
          if (
            value !==
            (edit.edge === "start" ? original.trimStart : original.trimEnd)
          ) {
            runtime.trimClip({
              type: "clip",
              id: clip.id,
              edge: edit.edge,
              value,
            });
          }
        }
        break;
      }
    }
  }

  function previewTrack(track: AudioTrackState): AudioTrackState {
    if (!edit) {
      return track;
    }
    const moves = edit.type === "move" ? getMoveChanges(edit) : [];
    const trims = edit.type === "trim" ? getTrimmedClips(edit) : [];
    const clips = track.clips.map((clip) => {
      const trim = trims.find((trim) => trim.id === clip.id);
      if (trim) {
        return trim;
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

  const referenceMove =
    edit?.type === "move"
      ? getMoveChanges(edit).find((move) => move.type === "reference")
      : undefined;

  return {
    audioTracks: state.audioTracks.map(previewTrack),
    recordingTrack: previewTrack(state.recordingTrack),
    referenceVideo:
      state.referenceVideo && referenceMove
        ? {
            ...state.referenceVideo,
            timelineStart: referenceMove.timelineOffset,
          }
        : state.referenceVideo,
    cancelEdit: () => setEdit(undefined),
    clear: () => {
      setEdit(undefined);
      setKeys(new Set());
    },
    hasSelection: keys.size > 0,
    isSelected: (clip: RecorderClipId) => keys.has(getKey(clip)),
    isEditing: (id: string) =>
      edit?.type === "trim"
        ? edit.clips.some((clip) => clip.id === id)
        : (edit?.snapshot.clips.some(
            (clip) => clip.type === "clip" && clip.id === id,
          ) ?? false),
    select,
    startEdit,
    updateEdit,
    finishEdit,
    removeSelected,
  };
}

function getMoveChanges(
  edit: Extract<ClipEdit, { type: "move" }>,
): RecorderClipMove[] {
  const delta = Math.max(edit.delta, -edit.snapshot.minimumVisibleStart);
  return edit.snapshot.clips.map((clip) => ({
    ...clip,
    timelineOffset: clip.timelineOffset + delta,
  }));
}

function getTrimmedClips(
  edit: Extract<ClipEdit, { type: "trim" }>,
): AudioClip[] {
  // Clamp one shared delta so every selected edge moves by the same amount.
  const minimumDelta = Math.max(
    ...edit.clips.map((clip) =>
      edit.edge === "start"
        ? -clip.trimStart
        : clip.trimStart + MIN_CLIP_DURATION - clip.trimEnd,
    ),
  );
  const maximumDelta = Math.min(
    ...edit.clips.map((clip) =>
      edit.edge === "start"
        ? clip.trimEnd - MIN_CLIP_DURATION - clip.trimStart
        : clip.duration - clip.trimEnd,
    ),
  );
  const delta = clamp(edit.delta, minimumDelta, maximumDelta);
  return edit.clips.map((clip) =>
    trimAudioClip({
      clip,
      edge: edit.edge,
      value: (edit.edge === "start" ? clip.trimStart : clip.trimEnd) + delta,
    }),
  );
}
