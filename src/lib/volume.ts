export const MIN_DB = -60;
export const MAX_DB = 6;
const LOG2 = Math.log(2);

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return MIN_DB;
  return 20 * Math.log10(gain);
}

const MAX_GAIN = dbToGain(MAX_DB);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampGain(gain: number): number {
  return clamp(gain, 0, MAX_GAIN);
}

export function percentToGain(percent: number): number {
  const position = clamp(percent / 100, 0, 1);
  if (position === 0) return 0;
  return Math.exp(((Math.pow(position, 1 / 8) * 198 - 192) / 6) * LOG2);
}

export function gainToPercent(gain: number): number {
  if (gain <= 0) return 0;
  const position = Math.pow(((6 * Math.log(gain)) / LOG2 + 192) / 198, 8);
  return clamp(position * 100, 0, 100);
}

export function dbToPercent(db: number): number {
  const clamped = clamp(db, MIN_DB, MAX_DB);
  return gainToPercent(dbToGain(clamped));
}
