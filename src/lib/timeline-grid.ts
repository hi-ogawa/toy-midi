import type { TimeSignature } from "../types";
import {
  getBeatsPerBar,
  getDenominatorNoteLength,
  getVisibleBarInterval,
} from "./timeline";

type TimelineGridKind = "bar" | "denominator-note" | "subdivision";

type TimelineGridLayer = {
  kind: TimelineGridKind;
  offsetPixels: number;
  spacingPixels: number;
};

const GRID_COLORS: Record<TimelineGridKind, string> = {
  bar: "#525252",
  "denominator-note": "#404040",
  subdivision: "#333333",
};

const MINIMUM_PIXEL_SPACING = 8;

/** The timeline's grid, with the same divisions and colors wherever it's drawn. */
export function getTimelineGridBackground({
  timeSignature,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  timeSignature: TimeSignature;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
} {
  const layers = calculateTimelineGridLayers({
    timeSignature,
    minimumPixelSpacing: MINIMUM_PIXEL_SPACING,
    pixelsPerBeat,
    viewportStartBeat,
    subdivisionsPerBeat,
  });
  return {
    backgroundImage: layers
      .map(
        ({ kind }) =>
          `linear-gradient(to right, ${GRID_COLORS[kind]} 1px, transparent 1px)`,
      )
      .join(", "),
    backgroundPosition: layers
      .map(({ offsetPixels }) => `${offsetPixels}px 0`)
      .join(", "),
    backgroundSize: layers
      .map(({ spacingPixels }) => `${spacingPixels}px 100%`)
      .join(", "),
  };
}

function calculateTimelineGridLayers({
  timeSignature,
  minimumPixelSpacing,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  timeSignature: TimeSignature;
  minimumPixelSpacing: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): TimelineGridLayer[] {
  const layers: TimelineGridLayer[] = [];
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const denominatorNoteInterval = getDenominatorNoteLength(timeSignature);
  const barInterval =
    getVisibleBarInterval({
      barWidth: beatsPerBar * pixelsPerBeat,
      minimumPixelSpacing,
    }) * beatsPerBar;
  layers.push(
    createLayer({
      intervalBeats: barInterval,
      kind: "bar",
      pixelsPerBeat,
      viewportStartBeat,
    }),
  );

  if (denominatorNoteInterval * pixelsPerBeat >= minimumPixelSpacing) {
    layers.push(
      createLayer({
        intervalBeats: denominatorNoteInterval,
        kind: "denominator-note",
        pixelsPerBeat,
        viewportStartBeat,
      }),
    );
  }

  const subdivisionInterval = 1 / subdivisionsPerBeat;
  if (subdivisionInterval * pixelsPerBeat >= minimumPixelSpacing) {
    layers.push(
      createLayer({
        intervalBeats: subdivisionInterval,
        kind: "subdivision",
        pixelsPerBeat,
        viewportStartBeat,
      }),
    );
  }

  return layers;
}

function createLayer({
  intervalBeats,
  kind,
  pixelsPerBeat,
  viewportStartBeat,
}: {
  intervalBeats: number;
  kind: TimelineGridKind;
  pixelsPerBeat: number;
  viewportStartBeat: number;
}): TimelineGridLayer {
  const spacingPixels = intervalBeats * pixelsPerBeat;
  return {
    kind,
    offsetPixels: -(viewportStartBeat * pixelsPerBeat) % spacingPixels,
    spacingPixels,
  };
}
