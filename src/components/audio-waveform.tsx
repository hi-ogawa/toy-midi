import {
  type AudioView,
  getAudioViewTiles,
  queryAudioView,
} from "../lib/audio-view";

const WAVEFORM_TILE_WIDTH = 256;

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
  if (rangeDuration <= 0 || pixelWidth <= 0 || visibleEnd <= visibleStart) {
    return null;
  }

  const pixelsPerSecond = pixelWidth / rangeDuration;
  const tiles = getAudioViewTiles({
    audioDuration,
    pixelsPerSecond,
    rangeStart,
    rangeEnd,
    visibleStart,
    visibleEnd,
    tilePixelWidth: WAVEFORM_TILE_WIDTH,
  });

  return (
    <>
      {tiles.map((tile) => {
        if (tile.queryEnd <= tile.queryStart) {
          return null;
        }
        const slice = queryAudioView(
          audioView,
          tile.queryStart,
          tile.queryEnd,
          WAVEFORM_TILE_WIDTH,
        );
        if (slice.data.length === 0) {
          return null;
        }
        return (
          <WaveformTile
            key={tile.index}
            data={slice.data}
            left={(slice.actualStart - rangeStart) * pixelsPerSecond}
            width={(slice.actualEnd - slice.actualStart) * pixelsPerSecond}
          />
        );
      })}
    </>
  );
}

function WaveformTile({
  data,
  left,
  width,
}: {
  data: number[];
  left: number;
  width: number;
}) {
  const upperPoints: string[] = [];
  const lowerPoints: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const amplitude = data[i];
    upperPoints.push(`${i},${-amplitude}`);
    lowerPoints.unshift(`${i},${amplitude}`);
  }
  const pathData = `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;
  return (
    <svg
      data-testid="audio-waveform-tile"
      className="absolute"
      style={{ left, width, top: "5%", height: "90%" }}
      viewBox={`0 -1 ${data.length - 1 || 1} 2`}
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
