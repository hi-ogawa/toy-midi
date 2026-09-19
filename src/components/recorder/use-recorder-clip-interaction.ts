import { useEffect, useState } from "react";
import { trimAudioClip, type AudioClip } from "../../lib/recorder/audio-clip";
import { deriveClipRegions } from "../../lib/recorder/clip-regions";
import {
  type RecorderClipId,
  type RecorderClipMove,
  type AudioTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";

type RecorderClipMoveSnapshot = {
  clips: RecorderClipMove[];
  minimumVisibleStart: number;
};

type ClipEdit =
  | { type: "move"; snapshot: RecorderClipMoveSnapshot; delta: number }
  | { type: "trim"; clip: AudioClip; edge: "start" | "end"; delta: number };

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

  function startMove({
    clip,
    additive,
  }: {
    clip: RecorderClipId;
    additive: boolean;
  }): void {
    onSelect();
    const draggedKey = getKey(clip);
    // Dragging a selected clip preserves the group; an unselected clip joins
    // with Ctrl/Cmd or replaces the selection otherwise.
    const selectedKeys = keys.has(draggedKey)
      ? new Set(keys)
      : additive
        ? new Set([...keys, draggedKey])
        : new Set([draggedKey]);
    setKeys(selectedKeys);
    const selected = getSelectedClips(selectedKeys);
    const clips = [
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
    const snapshot = {
      clips,
      minimumVisibleStart: Math.min(
        ...selected.clips.map((clip) => clip.timelineOffset + clip.trimStart),
        ...(selected.referenceVideo
          ? [selected.referenceVideo.timelineStart]
          : []),
      ),
    };
    setEdit({ type: "move", snapshot, delta: 0 });
  }

  function updateMove(delta: number): void {
    if (edit?.type === "move") {
      setEdit({ ...edit, delta });
    }
  }

  function finishMove(delta: number): void {
    if (edit?.type !== "move") {
      return;
    }
    setEdit(undefined);
    const changes = getMoveChanges({ ...edit, delta });
    if (
      changes.some(
        (change, index) =>
          change.timelineOffset !== edit.snapshot.clips[index].timelineOffset,
      )
    ) {
      runtime.moveClips(changes);
    }
  }

  function startTrim({
    clip,
    edge,
  }: {
    clip: RecorderClipId;
    edge: "start" | "end";
  }): void {
    const selected =
      clip.type === "clip"
        ? [...state.audioTracks, state.recordingTrack]
            .flatMap((track) => track.clips)
            .find((entry) => entry.id === clip.id)
        : undefined;
    if (!selected) {
      throw new Error("Recorder clip state is missing.");
    }
    onSelect();
    // TODO: Decide separately whether starting a trim should select the clip.
    const key = getKey(clip);
    if (!keys.has(key)) {
      setKeys(new Set([key]));
    }
    setEdit({ type: "trim", clip: selected, edge, delta: 0 });
  }

  function updateTrim(delta: number): void {
    if (edit?.type === "trim") {
      setEdit({ ...edit, delta });
    }
  }

  function finishTrim(delta: number): void {
    if (edit?.type !== "trim") {
      return;
    }
    setEdit(undefined);
    const clip = getTrimmedClip({ ...edit, delta });
    const value = edit.edge === "start" ? clip.trimStart : clip.trimEnd;
    if (
      value !==
      (edit.edge === "start" ? edit.clip.trimStart : edit.clip.trimEnd)
    ) {
      runtime.trimClip({ type: "clip", id: clip.id, edge: edit.edge, value });
    }
  }

  function previewTrack(track: AudioTrackState): AudioTrackState {
    if (!edit) {
      return track;
    }
    const moves = edit.type === "move" ? getMoveChanges(edit) : [];
    const clips = track.clips.map((clip) => {
      if (edit.type === "trim" && edit.clip.id === clip.id) {
        return getTrimmedClip(edit);
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
        ? edit.clip.id === id
        : (edit?.snapshot.clips.some(
            (clip) => clip.type === "clip" && clip.id === id,
          ) ?? false),
    select,
    startMove,
    updateMove,
    finishMove,
    startTrim,
    updateTrim,
    finishTrim,
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

function getTrimmedClip(edit: Extract<ClipEdit, { type: "trim" }>): AudioClip {
  const initial =
    edit.edge === "start" ? edit.clip.trimStart : edit.clip.trimEnd;
  return trimAudioClip({
    clip: edit.clip,
    edge: edit.edge,
    value: initial + edit.delta,
  });
}
