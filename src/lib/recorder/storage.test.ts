import { beforeEach, describe, expect, it, vi } from "vitest";
import { recorderStorage } from "./storage";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

describe("recorderStorage", () => {
  it("updates timeline zoom without replacing input preferences", () => {
    recorderStorage.writePreferences({
      input: { deviceId: "input-1", channel: 1 },
    });

    recorderStorage.updatePreferences({ timelinePixelsPerBeat: 120 });

    expect(recorderStorage.readPreferences()).toEqual({
      input: { deviceId: "input-1", channel: 1 },
      timelinePixelsPerBeat: 120,
    });
  });

  it("falls back when stored timeline zoom is out of range", () => {
    storage.set(
      "toy-midi:recorder-preferences",
      JSON.stringify({ timelinePixelsPerBeat: 401 }),
    );

    expect(recorderStorage.readPreferences()).toEqual({});
  });
});
