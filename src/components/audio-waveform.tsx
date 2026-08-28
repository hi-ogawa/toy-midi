import { type AudioView, queryAudioView } from "../lib/audio-view";

export function AudioWaveformView({
  audioView,
  audioDuration,
  rangeStart = 0,
  rangeEnd = audioDuration,
  visibleStart,
  visibleEnd,
  pixelWidth,
}: {
  audioView: AudioView;
  /** Complete source-buffer length, in seconds. */
  audioDuration: number;
  /** Source interval mapped across pixelWidth; defaults to the full buffer. */
  rangeStart?: number;
  rangeEnd?: number;
  /** Viewport-visible source interval to query and render, in seconds. */
  visibleStart: number;
  visibleEnd: number;
  /** Pixel width corresponding to [rangeStart, rangeEnd). */
  pixelWidth: number;
}) {
  if (audioView.data.length === 0) {
    return null;
  }

  const rangeDuration = rangeEnd - rangeStart;
  const visibleDuration = visibleEnd - visibleStart;
  const visiblePixelWidth = Math.max(
    1,
    Math.round((visibleDuration / rangeDuration) * pixelWidth),
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

  const pixelsPerSecond = pixelWidth / rangeDuration;
  const left = (slice.actualStart - rangeStart) * pixelsPerSecond;
  const width = (slice.actualEnd - slice.actualStart) * pixelsPerSecond;
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
      style={{ left, width, top: "5%", height: "90%" }}
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
