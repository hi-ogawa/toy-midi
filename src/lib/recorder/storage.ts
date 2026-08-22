const PREFERENCES_KEY = "toy-midi:recorder-preferences";

interface RecorderPreferences {
  inputDeviceId?: string;
  inputChannel: number;
}

const DEFAULT_PREFERENCES: RecorderPreferences = {
  inputChannel: 0,
};

class RecorderStorage {
  readPreferences(): RecorderPreferences {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(PREFERENCES_KEY) ?? "{}",
      );
      if (!isRecord(value)) {
        return DEFAULT_PREFERENCES;
      }
      return {
        inputDeviceId:
          typeof value.inputDeviceId === "string"
            ? value.inputDeviceId
            : undefined,
        inputChannel:
          typeof value.inputChannel === "number" &&
          Number.isInteger(value.inputChannel) &&
          value.inputChannel >= 0
            ? value.inputChannel
            : 0,
      };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  writePreferences(preferences: RecorderPreferences): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  }

  updatePreferences(updates: Partial<RecorderPreferences>): void {
    this.writePreferences({ ...this.readPreferences(), ...updates });
  }
}

export const recorderStorage = new RecorderStorage();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
