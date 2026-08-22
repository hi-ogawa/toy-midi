const STORAGE_KEY = "toy-midi:recorder-input-preference";

export interface RecorderInputPreference {
  deviceId?: string;
  channel: number;
}

export function loadRecorderInputPreference(): RecorderInputPreference {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (!isRecord(value)) {
      return { channel: 0 };
    }
    return {
      deviceId: typeof value.deviceId === "string" ? value.deviceId : undefined,
      channel:
        typeof value.channel === "number" &&
        Number.isInteger(value.channel) &&
        value.channel >= 0
          ? value.channel
          : 0,
    };
  } catch {
    return { channel: 0 };
  }
}

export function saveRecorderInputPreference(
  preference: RecorderInputPreference,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Input selection still works when storage is unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
