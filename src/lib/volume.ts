const MIN_DB = -60;
const MAX_DB = 6;

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function gainToDb(gain: number): number {
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

function percentToDb(percent: number): number {
  const clamped = clamp(percent, 0, 100);
  return MIN_DB + (MAX_DB - MIN_DB) * (clamped / 100);
}

export function dbToPercent(db: number): number {
  const clamped = clamp(db, MIN_DB, MAX_DB);
  return ((clamped - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

export function percentToGain(percent: number): number {
  return dbToGain(percentToDb(percent));
}

export function gainToPercent(gain: number): number {
  return dbToPercent(gainToDb(gain));
}
