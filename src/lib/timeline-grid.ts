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
  scrollBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  colors: Record<TimelineGridKind, string>;
  minimumPixelSpacing: number;
  pixelsPerBeat: number;
  scrollBeat: number;
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
    scrollBeat,
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
  scrollBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  minimumPixelSpacing: number;
  pixelsPerBeat: number;
  scrollBeat: number;
  subdivisionsPerBeat: number;
}): TimelineGridLayer[] {
  const layers: TimelineGridLayer[] = [];
  let barInterval = beatsPerBar;
  while (barInterval * pixelsPerBeat < minimumPixelSpacing) {
    barInterval *= 2;
  }
  layers.push(
    createLayer({
      intervalBeats: barInterval,
      kind: "bar",
      pixelsPerBeat,
      scrollBeat,
    }),
  );

  if (pixelsPerBeat >= minimumPixelSpacing) {
    layers.push(
      createLayer({
        intervalBeats: 1,
        kind: "beat",
        pixelsPerBeat,
        scrollBeat,
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
        scrollBeat,
      }),
    );
  }

  return layers;
}

function createLayer({
  intervalBeats,
  kind,
  pixelsPerBeat,
  scrollBeat,
}: {
  intervalBeats: number;
  kind: TimelineGridKind;
  pixelsPerBeat: number;
  scrollBeat: number;
}): TimelineGridLayer {
  const spacingPixels = intervalBeats * pixelsPerBeat;
  return {
    kind,
    offsetPixels: -(scrollBeat * pixelsPerBeat) % spacingPixels,
    spacingPixels,
  };
}
