import { useEffect, useState } from "react";
import {
  type RecorderClipId,
  type RecorderClipMove,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";

export type RecorderClipMoveSnapshot = {
  clips: RecorderClipMove[];
  minimumVisibleStart: number;
};

export type RecorderClipTrimSnapshot = {
  clip: RecorderClipId;
  edge: "start" | "end";
  initialValue: number;
};

export function useRecorderClipInteraction({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const [keys, setKeys] = useState(() => new Set<string>());

  function getKey(clip: RecorderClipId): string {
    return `${clip.type}:${clip.id}`;
  }

  function getSelectedClips(selectedKeys: ReadonlySet<string>) {
    return {
      audioTracks: state.audioTracks.filter((track) =>
        selectedKeys.has(getKey({ type: "audio", id: track.id })),
      ),
      takes: state.recordingTrack.takes.filter((take) =>
        selectedKeys.has(getKey({ type: "take", id: take.id })),
      ),
    };
  }

  useEffect(() => {
    const available = new Set([
      ...state.audioTracks
        .filter((track) => track.clip)
        .map((track) => getKey({ type: "audio", id: track.id })),
      ...state.recordingTrack.takes.map((take) =>
        getKey({ type: "take", id: take.id }),
      ),
    ]);
    setKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.recordingTrack.takes]);

  function select(clip: RecorderClipId, additive: boolean): void {
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
  }): RecorderClipMoveSnapshot {
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
      ...selected.audioTracks.map((track) => ({
        type: "audio" as const,
        id: track.id,
        timelineOffset: track.timelineOffset,
      })),
      ...selected.takes.map((take) => ({
        type: "take" as const,
        id: take.id,
        timelineOffset: take.timelineOffset,
      })),
    ];
    return {
      clips,
      minimumVisibleStart: Math.min(
        ...selected.audioTracks.map(
          (track) => track.timelineOffset + track.trimStart,
        ),
        ...selected.takes.map((take) => take.timelineOffset + take.trimStart),
      ),
    };
  }

  function move(snapshot: RecorderClipMoveSnapshot, delta: number): void {
    const clampedDelta = Math.max(delta, -snapshot.minimumVisibleStart);
    runtime.moveClips(
      snapshot.clips.map((clip) => ({
        type: clip.type,
        id: clip.id,
        timelineOffset: clip.timelineOffset + clampedDelta,
      })),
    );
  }

  function startTrim({
    clip,
    edge,
  }: {
    clip: RecorderClipId;
    edge: "start" | "end";
  }): RecorderClipTrimSnapshot {
    const selected =
      clip.type === "audio"
        ? state.audioTracks.find((track) => track.id === clip.id)
        : state.recordingTrack.takes.find((take) => take.id === clip.id);
    if (!selected) {
      throw new Error("Recorder clip state is missing.");
    }
    return {
      clip,
      edge,
      initialValue: edge === "start" ? selected.trimStart : selected.trimEnd,
    };
  }

  function trim(snapshot: RecorderClipTrimSnapshot, delta: number): void {
    runtime.trimClip({
      ...snapshot.clip,
      edge: snapshot.edge,
      value: snapshot.initialValue + delta,
    });
  }

  function removeSelected(): void {
    const selected = getSelectedClips(keys);
    runtime.removeClips([
      ...selected.audioTracks.map((track) => ({
        type: "audio" as const,
        id: track.id,
      })),
      ...selected.takes.map((take) => ({
        type: "take" as const,
        id: take.id,
      })),
    ]);
    setKeys(new Set());
  }

  return {
    clear: () => setKeys(new Set()),
    hasSelection: keys.size > 0,
    isSelected: (clip: RecorderClipId) => keys.has(getKey(clip)),
    select,
    startMove,
    move,
    startTrim,
    trim,
    removeSelected,
  };
}
