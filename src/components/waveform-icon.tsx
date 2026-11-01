import type { Waveform } from "../lib/dsp/subtractive-synth";

const WAVEFORM_PATHS: Record<Waveform, string> = {
  sine: "M1 6 C4 -1 8 -1 12 6 S20 13 23 6",
  triangle: "M1 6 L6 1 L17 11 L23 6",
  sawtooth: "M1 11 L12 1 L12 11 L23 1 L23 11",
  square: "M1 11 L1 1 L12 1 L12 11 L23 11 L23 1",
};

export function WaveformIcon({
  waveform,
  className,
}: {
  waveform: Waveform;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={24}
      height={12}
      viewBox="0 0 24 12"
      aria-hidden
    >
      <path
        d={WAVEFORM_PATHS[waveform]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
      />
    </svg>
  );
}
