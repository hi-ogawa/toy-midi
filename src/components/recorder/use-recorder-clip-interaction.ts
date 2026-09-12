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
  onSelect,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  /** Only coordinates selection domains by clearing selection in the other domain. */
  onSelect: () => void;
}) {
  const [keys, setKeys] = useState(() => new Set<string>());

  function getKey(clip: RecorderClipId): string {
    return clip.type === "reference" ? clip.type : `${clip.trackId}:${clip.id}`;
  }

  function getSelectedClips(selectedKeys: ReadonlySet<string>) {
    return {
      audioClips: state.audioTracks.flatMap((track) =>
        track.clips.flatMap((clip) =>
          selectedKeys.has(
            getKey({ type: "audio", trackId: track.id, id: clip.id }),
          )
            ? [{ trackId: track.id, clip }]
            : [],
        ),
      ),
      referenceVideo: selectedKeys.has(getKey({ type: "reference" }))
        ? state.referenceVideo
        : undefined,
    };
  }

  useEffect(() => {
    const available = new Set([
      ...state.audioTracks.flatMap((track) =>
        track.clips.map((clip) =>
          getKey({ type: "audio", trackId: track.id, id: clip.id }),
        ),
      ),
      ...(state.referenceVideo ? [getKey({ type: "reference" })] : []),
    ]);
    setKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.referenceVideo]);

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
  }): RecorderClipMoveSnapshot {
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
      ...selected.audioClips.map(({ trackId, clip }) => ({
        type: "audio" as const,
        trackId,
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
    return {
      clips,
      minimumVisibleStart: Math.min(
        ...selected.audioClips.map(
          ({ clip }) => clip.timelineOffset + clip.trimStart,
        ),
        ...(selected.referenceVideo
          ? [selected.referenceVideo.timelineStart]
          : []),
      ),
    };
  }

  function move(snapshot: RecorderClipMoveSnapshot, delta: number): void {
    const clampedDelta = Math.max(delta, -snapshot.minimumVisibleStart);
    runtime.moveClips(
      snapshot.clips.map((clip) =>
        clip.type === "reference"
          ? {
              type: "reference" as const,
              timelineOffset: clip.timelineOffset + clampedDelta,
            }
          : {
              type: clip.type,
              trackId: clip.trackId,
              id: clip.id,
              timelineOffset: clip.timelineOffset + clampedDelta,
            },
      ),
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
        ? state.audioTracks
            .find((track) => track.id === clip.trackId)
            ?.clips.find((entry) => entry.id === clip.id)
        : undefined;
    if (!selected) {
      throw new Error("Recorder clip state is missing.");
    }
    onSelect();
    return {
      clip,
      edge,
      initialValue: edge === "start" ? selected.trimStart : selected.trimEnd,
    };
  }

  function trim(snapshot: RecorderClipTrimSnapshot, delta: number): void {
    if (snapshot.clip.type === "reference") {
      throw new Error("Reference clips cannot be trimmed.");
    }
    runtime.trimClip({
      ...snapshot.clip,
      edge: snapshot.edge,
      value: snapshot.initialValue + delta,
    });
  }

  function removeSelected(): void {
    const selected = getSelectedClips(keys);
    runtime.removeClips([
      ...selected.audioClips.map(({ trackId, clip }) => ({
        type: "audio" as const,
        trackId,
        id: clip.id,
      })),
      ...(selected.referenceVideo ? [{ type: "reference" as const }] : []),
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
