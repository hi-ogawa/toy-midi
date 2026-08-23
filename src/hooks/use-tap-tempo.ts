import { useRef } from "react";

const MAX_TAPS = 8;
const RESET_AFTER_MS = 2000;

export function useTapTempo({
  min,
  max,
  onTempoChange,
}: {
  min: number;
  max: number;
  onTempoChange: (tempo: number) => void;
}) {
  const tapTimesRef = useRef<number[]>([]);

  return () => {
    const now = performance.now();
    const tapTimes = tapTimesRef.current;
    const lastTap = tapTimes.at(-1);

    if (lastTap !== undefined && now - lastTap > RESET_AFTER_MS) {
      tapTimes.length = 0;
    }

    tapTimes.push(now);
    if (tapTimes.length > MAX_TAPS) {
      tapTimes.shift();
    }
    if (tapTimes.length < 2) {
      return;
    }

    const averageInterval =
      (tapTimes.at(-1)! - tapTimes[0]) / (tapTimes.length - 1);
    const tempo = Math.round(60000 / averageInterval);
    if (tempo >= min && tempo <= max) {
      onTempoChange(tempo);
    }
  };
}
