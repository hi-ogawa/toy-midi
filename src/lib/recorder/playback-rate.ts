export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5];

/** Returns the next supported rate, or undefined at the end of the range. */
export function getNextPlaybackRate({
  rate,
  direction,
}: {
  rate: number;
  direction: "increase" | "decrease";
}): number | undefined {
  return direction === "increase"
    ? PLAYBACK_RATES.find((value) => value > rate)
    : PLAYBACK_RATES.findLast((value) => value < rate);
}
