import { gainToDb, MAX_DB, MIN_DB } from "./music";

export function getInputMeterState({
  active,
  peak,
}: {
  active: boolean;
  peak: number;
}) {
  const getPosition = (value: number) =>
    ((value - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const zeroPosition = getPosition(0);
  const decibels = gainToDb(peak);
  const meterValue = Math.max(MIN_DB, Math.min(MAX_DB, decibels));
  const levelPosition = active ? getPosition(meterValue) : 0;
  return {
    label: active ? `${decibels.toFixed(1)} dBFS` : "-∞ dBFS",
    levelPosition,
    meterValue,
    zeroPosition,
  };
}
