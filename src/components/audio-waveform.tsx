import { type AudioView, queryAudioView } from "../lib/audio-view";

export function AudioWaveformView({
  audioView,
  rangeStart = 0,
  visibleStart,
  visibleEnd,
  pixelsPerSecond,
}: {
  audioView: AudioView;
  /** Source time mapped to the clip's left edge, in seconds. */
  rangeStart?: number;
  /** Viewport-visible source interval to query and render, in seconds. */
  visibleStart: number;
  visibleEnd: number;
  /** Timeline scale, independent of the clip box's minimum width. */
  pixelsPerSecond: number;
}) {
  if (audioView.data.length === 0) {
    return null;
  }

  const visibleDuration = visibleEnd - visibleStart;
  const visiblePixelWidth = Math.max(
    1,
    Math.round(visibleDuration * pixelsPerSecond),
  );
  const slice = queryAudioView(
    audioView,
    visibleStart,
    visibleEnd,
    visiblePixelWidth,
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
        left: (slice.actualStart - rangeStart) * pixelsPerSecond,
        width: (slice.actualEnd - slice.actualStart) * pixelsPerSecond,
        top: "5%",
        height: "90%",
      }}
      viewBox={`0 -1 ${slice.data.length - 1 || 1} 2`}
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
