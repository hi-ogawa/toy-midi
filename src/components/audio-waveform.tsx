import { type AudioView, queryAudioView } from "../lib/audio-view";

export function AudioWaveformView({
  audioView,
  sourceStart = 0,
  visibleStart,
  visibleEnd,
  pixelsPerSecond,
}: {
  audioView: AudioView;
  /** Source-time origin of the clip's local coordinate frame, in seconds. */
  sourceStart?: number;
  /** Viewport-visible source interval to query and render, in seconds. */
  visibleStart: number;
  visibleEnd: number;
  /** Timeline scale, independent of the clip box's minimum width. */
  pixelsPerSecond: number;
}) {
  if (audioView.data.length === 0) {
    return null;
  }

  const slice = queryAudioView(
    audioView,
    visibleStart,
    visibleEnd,
    pixelsPerSecond,
  );

  if (slice.data.length === 0) {
    return null;
  }

  const startPixel = slice.actualStart * pixelsPerSecond;
  const endPixel = slice.actualEnd * pixelsPerSecond;
  const pixelsPerPoint = (endPixel - startPixel) / slice.data.length;
  // Keep viewport bounds on a source-anchored pixel grid while preserving the
  // fractional waveform position inside it as culling changes.
  // Example in source pixels, with 4 points spaced 0.975 px apart:
  //   SVG viewport:     10 |-------------------------------| 15
  //   bucket coverage:      10.3 |------------------| 14.2
  //   startPixel = 10.3, endPixel = 14.2, slice.data.length = 4
  //   pixelsPerPoint = 0.975, leftPixel = 10, width = 5
  //   viewBoxStart = -0.307692..., viewBoxWidth = 5.128205...
  // The viewport expands to [10, 15), but the points stay at 10.3, 11.275, ...
  // A viewBox starting at (10 - 10.3) / 0.975 with width 5 / 0.975 preserves
  // that placement. The CSS left below translates into the clip's local frame.
  // Keep sourceStart * pixelsPerSecond fractional: the parent moves by that
  // amount, so subtracting it exactly cancels the moving comp boundary.
  // The source origin may remain fractional on screen, but its pixel-grid phase
  // stays fixed. Rounding this subtraction would introduce drift and resets.
  const leftPixel = Math.floor(startPixel);
  const width = Math.ceil(endPixel) - leftPixel;
  const viewBoxStart = (leftPixel - startPixel) / pixelsPerPoint;
  const viewBoxWidth = width / pixelsPerPoint;

  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];
  for (let i = 0; i < slice.data.length; i++) {
    const amplitude = slice.data[i];
    upperPoints.push(`${i},${-amplitude}`);
    lowerPoints.unshift(`${i},${amplitude}`);
  }
  const pathData = `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;

  return (
    <svg
      className="absolute"
      style={{
        left: leftPixel - sourceStart * pixelsPerSecond,
        width,
        top: "5%",
        height: "90%",
      }}
      viewBox={`${viewBoxStart} -1 ${viewBoxWidth} 2`}
      preserveAspectRatio="none"
    >
      <path
        d={pathData}
        fill="rgba(255, 255, 255, 0.3)"
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
