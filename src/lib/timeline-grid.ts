import { getVisibleBarInterval } from "./timeline";

type TimelineGridKind = "bar" | "beat" | "subdivision";

type TimelineGridLayer = {
  kind: TimelineGridKind;
  offsetPixels: number;
  spacingPixels: number;
};

// TODO: Migrate the main editor's grid rendering to this shared utility.
export function getTimelineGridBackground({
  beatsPerBar,
  colors,
  minimumPixelSpacing,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  colors: Record<TimelineGridKind, string>;
  minimumPixelSpacing: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
} {
  const layers = calculateTimelineGridLayers({
    beatsPerBar,
    minimumPixelSpacing,
    pixelsPerBeat,
    viewportStartBeat,
    subdivisionsPerBeat,
  });
  return {
    backgroundImage: layers
      .map(
        ({ kind }) =>
          `linear-gradient(to right, ${colors[kind]} 1px, transparent 1px)`,
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
  beatsPerBar,
  minimumPixelSpacing,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  minimumPixelSpacing: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): TimelineGridLayer[] {
  const layers: TimelineGridLayer[] = [];
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

  if (pixelsPerBeat >= minimumPixelSpacing) {
    layers.push(
      createLayer({
        intervalBeats: 1,
        kind: "beat",
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
