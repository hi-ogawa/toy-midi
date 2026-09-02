import { useEffect, useRef, useState } from "react";
import {
  type RecorderClipId,
  type RecorderClipMove,
  type RecorderClipTrim,
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
  const [movePreview, setMovePreview] = useState<RecorderClipMove[]>();
  const movePreviewRef = useRef<RecorderClipMove[] | undefined>(undefined);
  const [trimPreview, setTrimPreview] = useState<RecorderClipTrim>();
  const trimPreviewRef = useRef<RecorderClipTrim | undefined>(undefined);

  function getKey(clip: RecorderClipId): string {
    return clip.type === "reference" ? clip.type : `${clip.type}:${clip.id}`;
  }

  function getSelectedClips(selectedKeys: ReadonlySet<string>) {
    return {
      audioTracks: state.audioTracks.filter((track) =>
        selectedKeys.has(getKey({ type: "audio", id: track.id })),
      ),
      takes: state.recordingTrack.takes.filter((take) =>
        selectedKeys.has(getKey({ type: "take", id: take.id })),
      ),
      referenceVideo: selectedKeys.has(getKey({ type: "reference" }))
        ? state.referenceVideo
        : undefined,
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
      ...(state.referenceVideo ? [getKey({ type: "reference" })] : []),
    ]);
    setKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [state.audioTracks, state.recordingTrack.takes, state.referenceVideo]);

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
        ...selected.audioTracks.map(
          (track) => track.timelineOffset + track.trimStart,
        ),
        ...selected.takes.map((take) => take.timelineOffset + take.trimStart),
        ...(selected.referenceVideo
          ? [selected.referenceVideo.timelineStart]
          : []),
      ),
    };
  }

  function previewMove(
    snapshot: RecorderClipMoveSnapshot,
    delta: number,
  ): void {
    const clampedDelta = Math.max(delta, -snapshot.minimumVisibleStart);
    const preview = snapshot.clips.map((clip) =>
      clip.type === "reference"
        ? {
            type: "reference" as const,
            timelineOffset: clip.timelineOffset + clampedDelta,
          }
        : {
            type: clip.type,
            id: clip.id,
            timelineOffset: clip.timelineOffset + clampedDelta,
          },
    );
    movePreviewRef.current = preview;
    setMovePreview(preview);
  }

  function commitMove(): void {
    const preview = movePreviewRef.current;
    movePreviewRef.current = undefined;
    setMovePreview(undefined);
    if (preview) {
      runtime.moveClips(preview);
    }
  }

  function cancelMove(): void {
    movePreviewRef.current = undefined;
    setMovePreview(undefined);
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
        : clip.type === "take"
          ? state.recordingTrack.takes.find((take) => take.id === clip.id)
          : undefined;
    if (!selected) {
      throw new Error("Recorder clip state is missing.");
    }
    return {
      clip,
      edge,
      initialValue: edge === "start" ? selected.trimStart : selected.trimEnd,
    };
  }

  function previewTrim(
    snapshot: RecorderClipTrimSnapshot,
    delta: number,
  ): void {
    if (snapshot.clip.type === "reference") {
      throw new Error("Reference clips cannot be trimmed.");
    }
    const preview = {
      ...snapshot.clip,
      edge: snapshot.edge,
      value: snapshot.initialValue + delta,
    };
    trimPreviewRef.current = preview;
    setTrimPreview(preview);
  }

  function commitTrim(): void {
    const preview = trimPreviewRef.current;
    trimPreviewRef.current = undefined;
    setTrimPreview(undefined);
    if (preview) {
      runtime.trimClip(preview);
    }
  }

  function cancelTrim(): void {
    trimPreviewRef.current = undefined;
    setTrimPreview(undefined);
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
      ...(selected.referenceVideo ? [{ type: "reference" as const }] : []),
    ]);
    setKeys(new Set());
  }

  return {
    clear: () => setKeys(new Set()),
    hasSelection: keys.size > 0,
    isSelected: (clip: RecorderClipId) => keys.has(getKey(clip)),
    getPreviewOffset: (clip: RecorderClipId) =>
      movePreview?.find(
        (preview) =>
          preview.type === clip.type &&
          (preview.type === "reference" ||
            (clip.type !== "reference" && preview.id === clip.id)),
      )?.timelineOffset,
    getTrimPreview: (clip: RecorderClipId) =>
      trimPreview?.type === clip.type && trimPreview.id === clip.id
        ? trimPreview
        : undefined,
    select,
    startMove,
    previewMove,
    commitMove,
    cancelMove,
    startTrim,
    previewTrim,
    commitTrim,
    cancelTrim,
    removeSelected,
  };
}
