const MIN_DB = -60;
const MAX_DB = 6;
const UNITY_DB = 0;
const UNITY_PERCENT = 75;

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
  if (clamped <= UNITY_PERCENT) {
    const t = clamped / UNITY_PERCENT;
    return MIN_DB + (UNITY_DB - MIN_DB) * t;
  }
  const t = (clamped - UNITY_PERCENT) / (100 - UNITY_PERCENT);
  return UNITY_DB + (MAX_DB - UNITY_DB) * t;
}

export function dbToPercent(db: number): number {
  const clamped = clamp(db, MIN_DB, MAX_DB);
  if (clamped <= UNITY_DB) {
    const t = (clamped - MIN_DB) / (UNITY_DB - MIN_DB);
    return UNITY_PERCENT * t;
  }
  const t = (clamped - UNITY_DB) / (MAX_DB - UNITY_DB);
  return UNITY_PERCENT + (100 - UNITY_PERCENT) * t;
}

export function percentToGain(percent: number): number {
  return dbToGain(percentToDb(percent));
}

export function gainToPercent(gain: number): number {
  return dbToPercent(gainToDb(gain));
}
