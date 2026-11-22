import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { ProjectUiStore } from "../lib/preferences";
import type { EditorRuntime } from "../lib/runtime";
import {
  DEFAULT_GRID_DIVISION,
  GRID_DIVISIONS,
  type GridDivision,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
  secondsToBeats,
} from "../lib/timeline";
import type { TimeSignature } from "../types";
import { listenTouchPinch, type TouchPinch } from "../utils/touch-pinch";

export function useTimeline({
  projectUiStore,
  runtime,
  isPlaying,
  tempo,
  timeSignature,
}: {
  projectUiStore: ProjectUiStore;
  runtime: EditorRuntime;
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
  const subdivisionsPerBeat = GRID_DIVISIONS[gridDivision];

  // Page the viewport forward when the playhead nears its right edge or leaves
  // it during playback with auto-scroll on.
  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled || viewportWidth === 0) {
      return;
    }
    function keepPlayheadInView() {
      const position = runtime.transport.store.get().position;
      const playheadBeat = secondsToBeats(position, tempo);
      const visibleBeats = viewportWidth / pixelsPerBeat;
      if (
        playheadBeat < viewportStartBeat ||
        viewportStartBeat + visibleBeats * 0.9 < playheadBeat
      ) {
        setViewportStartBeat(Math.max(0, playheadBeat - visibleBeats * 0.1));
      }
    }
    keepPlayheadInView();
    return runtime.transport.store.subscribe(keepPlayheadInView);
  }, [
    autoScrollEnabled,
    isPlaying,
    pixelsPerBeat,
    tempo,
    runtime,
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

  function handleWheel(event: WheelEvent, viewport: HTMLElement) {
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
    const nextPixelsPerBeat = clampPixelsPerBeat(
      pixelsPerBeat * (event.deltaY > 0 ? 0.9 : 1.1),
    );
    zoom(nextPixelsPerBeat, Math.max(0, event.clientX - rect.left));
  }

  // Pin the beat under the touch centroid, so one finger pans and two fingers
  // pinch-zoom around their midpoint.
  function startTouchNavigation(pinch: TouchPinch, viewport: HTMLElement) {
    const anchorX = pinch.x - viewport.getBoundingClientRect().left;
    return {
      beat: viewportStartBeat + anchorX / pixelsPerBeat,
      distance: pinch.distance,
      pixelsPerBeat,
    };
  }

  function moveTouchNavigation(
    pinch: TouchPinch,
    origin: ReturnType<typeof startTouchNavigation>,
    viewport: HTMLElement,
  ) {
    const anchorX = pinch.x - viewport.getBoundingClientRect().left;
    const nextPixelsPerBeat =
      origin.distance > 0
        ? clampPixelsPerBeat(
            (origin.pixelsPerBeat * pinch.distance) / origin.distance,
          )
        : origin.pixelsPerBeat;
    setPixelsPerBeat(nextPixelsPerBeat);
    setViewportStartBeat(
      Math.max(0, origin.beat - anchorX / nextPixelsPerBeat),
    );
  }

  const onWheel = useEffectEvent(handleWheel);
  const onTouchStart = useEffectEvent(startTouchNavigation);
  const onTouchMove = useEffectEvent(moveTouchNavigation);

  const viewportRef = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });
    observer.observe(viewport);
    const target = viewport.parentElement!;
    const handleWheel = (event: WheelEvent) => onWheel(event, viewport);
    target.addEventListener("wheel", handleWheel, { passive: false });
    const stopTouch = listenTouchPinch({
      element: target,
      accept: (event) => event.clientX >= viewport.getBoundingClientRect().left,
      onStart: (pinch) => onTouchStart(pinch, viewport),
      onMove: (pinch, origin) => onTouchMove(pinch, origin, viewport),
    });
    return () => {
      observer.disconnect();
      target.removeEventListener("wheel", handleWheel);
      stopTouch();
    };
  }, []);

  return {
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

function clampPixelsPerBeat(value: number) {
  return Math.max(MIN_PIXELS_PER_BEAT, Math.min(MAX_PIXELS_PER_BEAT, value));
}
