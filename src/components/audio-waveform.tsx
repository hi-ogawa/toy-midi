import { type AudioView, queryAudioView } from "../lib/audio-view";

export function AudioWaveformView({
  audioView,
  audioDuration,
  displayStart = 0,
  displayEnd = audioDuration,
  visibleStart,
  visibleEnd,
  pixelWidth,
}: {
  audioView: AudioView;
  /** Complete source-buffer length, in seconds. */
  audioDuration: number;
  /** Source interval mapped across the component width; defaults to the full buffer. */
  displayStart?: number;
  displayEnd?: number;
  /** Viewport-visible subset of the displayed source interval, in seconds. */
  visibleStart: number;
  visibleEnd: number;
  /** Pixel width occupied by the complete displayed source interval. */
  pixelWidth: number;
}) {
  if (audioView.data.length === 0) {
    return null;
  }

  const displayDuration = displayEnd - displayStart;
  const visibleDuration = visibleEnd - visibleStart;
  const visiblePixelWidth = Math.max(
    1,
    Math.round((visibleDuration / displayDuration) * pixelWidth),
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

  const leftPercent =
    ((slice.actualStart - displayStart) / displayDuration) * 100;
  const widthPercent =
    ((slice.actualEnd - slice.actualStart) / displayDuration) * 100;
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
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
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
