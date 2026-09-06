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
  /**
   * Timeline scale used for pixel placement and as the query's target points
   * per second, aiming for roughly one pooled peak per pixel. Integer pooling
   * and available source resolution determine the actual point density.
   * Independent of the clip box's minimum width.
   */
  pixelsPerSecond: number;
}) {
  if (audioView.data.length === 0 || visibleEnd <= visibleStart) {
    return null;
  }

  // Expand culling to source-anchored 256 px windows. Small boundary edits keep
  // the same query/SVG bounds; the parent clip still hides the excess waveform.
  const cullStep = 256;
  const queryStart =
    (Math.floor((visibleStart * pixelsPerSecond) / cullStep) * cullStep) /
    pixelsPerSecond;
  const queryEnd =
    (Math.ceil((visibleEnd * pixelsPerSecond) / cullStep) * cullStep) /
    pixelsPerSecond;
  const slice = queryAudioView(
    audioView,
    queryStart,
    queryEnd,
    pixelsPerSecond,
  );

  if (slice.data.length === 0) {
    return null;
  }

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
        left: (slice.actualStart - sourceStart) * pixelsPerSecond,
        width: (slice.actualEnd - slice.actualStart) * pixelsPerSecond,
        top: "5%",
        height: "90%",
      }}
      viewBox={`0 -1 ${slice.data.length} 2`}
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
