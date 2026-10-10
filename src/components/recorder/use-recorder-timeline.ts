import { useCallback, useEffect, useState } from "react";
import type { ProjectUiStore } from "../../lib/recorder/storage";
import type { TransportStore } from "../../lib/recorder/transport";
import {
  DEFAULT_GRID_DIVISION,
  getBeatsPerBar,
  GRID_DIVISIONS,
  type GridDivision,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
  secondsToBeats,
} from "../../lib/timeline";
import type { TimeSignature } from "../../types";

export function useRecorderTimeline({
  projectUiStore,
  transportStore,
  isPlaying,
  tempo,
  timeSignature,
}: {
  projectUiStore: ProjectUiStore;
  transportStore: TransportStore;
  isPlaying: boolean;
  tempo: number;
  timeSignature: TimeSignature;
}) {
  const [gridDivision, setGridDivision] = useState<GridDivision>(
    DEFAULT_GRID_DIVISION,
  );
  const [autoScrollEnabled, setAutoScrollEnabled] =
    projectUiStore.useValue("autoScrollEnabled");
  const [pixelsPerBeat, setPixelsPerBeat] = projectUiStore.useValue(
    "timelinePixelsPerBeat",
  );
  const [viewportStartBeat, setViewportStartBeat] =
    projectUiStore.useValue("timelineStartBeat");
  const [viewportWidth, setViewportWidth] = useState(0);
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const subdivisionsPerBeat = GRID_DIVISIONS[gridDivision];

  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled || viewportWidth === 0) {
      return;
    }
    function follow() {
      const playheadBeat = secondsToBeats(transportStore.get().position, tempo);
      const visibleBeats = viewportWidth / pixelsPerBeat;
      if (
        playheadBeat < viewportStartBeat ||
        viewportStartBeat + visibleBeats * 0.9 < playheadBeat
      ) {
        setViewportStartBeat(Math.max(0, playheadBeat - visibleBeats * 0.1));
      }
    }
    follow();
    return transportStore.subscribe(follow);
  }, [
    autoScrollEnabled,
    isPlaying,
    pixelsPerBeat,
    tempo,
    transportStore,
    viewportStartBeat,
    viewportWidth,
  ]);

  function zoom(nextPixelsPerBeat: number, anchorX: number) {
    const beatAtAnchor = anchorX / pixelsPerBeat + viewportStartBeat;
    setPixelsPerBeat(nextPixelsPerBeat);
    setViewportStartBeat(
      Math.max(0, beatAtAnchor - anchorX / nextPixelsPerBeat),
    );
  }

  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!viewport) {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        setViewportWidth(entry.contentRect.width);
      });
      observer.observe(viewport);
      const wheelTarget = viewport.parentElement;
      const handleWheel = (event: WheelEvent) => {
        const rect = viewport.getBoundingClientRect();
        if (event.clientX < rect.left) {
          return;
        }
        event.preventDefault();
        if (!event.ctrlKey) {
          const delta = event.deltaX || event.deltaY;
          setViewportStartBeat((value) =>
            Math.max(0, value + delta / pixelsPerBeat),
          );
          return;
        }
        if (event.deltaY === 0) {
          return;
        }
        const nextPixelsPerBeat = Math.max(
          MIN_PIXELS_PER_BEAT,
          Math.min(
            MAX_PIXELS_PER_BEAT,
            pixelsPerBeat * (event.deltaY > 0 ? 0.9 : 1.1),
          ),
        );
        zoom(nextPixelsPerBeat, Math.max(0, event.clientX - rect.left));
      };
      wheelTarget?.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        observer.disconnect();
        wheelTarget?.removeEventListener("wheel", handleWheel);
      };
    },
    [pixelsPerBeat, viewportStartBeat],
  );

  return {
    beatsPerBar,
    gridDivision,
    pixelsPerBeat,
    viewportStartBeat,
    setGridDivision,
    subdivisionsPerBeat,
    tempo,
    timeSignature,
    viewportRef,
    viewportWidth,
    autoScrollEnabled,
    setAutoScrollEnabled,
  };
}
