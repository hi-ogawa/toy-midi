export type TimelineGridLayer = {
  intervalBeats: number;
  kind: "bar" | "beat" | "subdivision";
  offsetPixels: number;
  spacingPixels: number;
};

export function calculateTimelineGridLayers({
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
  kind: TimelineGridLayer["kind"];
  pixelsPerBeat: number;
  scrollBeat: number;
}): TimelineGridLayer {
  const spacingPixels = intervalBeats * pixelsPerBeat;
  return {
    intervalBeats,
    kind,
    offsetPixels: -(scrollBeat * pixelsPerBeat) % spacingPixels,
    spacingPixels,
  };
}
