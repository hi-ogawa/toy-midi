import { afterEach, expect, test, vi } from "vitest";

const key = "toy-midi:recorder-preferences";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("merges independent preference edits and restores them after reload", async () => {
  let saved = JSON.stringify({ autoScrollEnabled: false });
  vi.stubGlobal("localStorage", {
    getItem: () => saved,
    setItem: (name: string, value: string) => {
      expect(name).toBe(key);
      saved = value;
    },
  });
  const { recorderPreferences: preferences } = await import("./storage");
  expect(preferences.get().autoScrollEnabled).toBe(false);
  expect(preferences.get().timelinePixelsPerBeat).toBeGreaterThan(0);
  const listener = vi.fn();
  const unsubscribe = preferences.subscribe(listener);

  preferences.update({ input: { deviceId: "mic", channel: 0 } });
  preferences.update({ timelinePixelsPerBeat: 120 });
  preferences.update((current) => ({
    input: { ...current.input!, latencyCompensation: 0.05 },
  }));
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
  const expected = preferences.get();
  expect(expected).toMatchObject({
    autoScrollEnabled: false,
    timelinePixelsPerBeat: 120,
    input: { deviceId: "mic", channel: 0, latencyCompensation: 0.05 },
  });

  vi.resetModules();
  const reloaded = (await import("./storage")).recorderPreferences;
  expect(reloaded.get()).toEqual(expected);
});

test("keeps updates and subscriptions working when storage is unavailable", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  const { recorderPreferences: preferences } = await import("./storage");
  const listener = vi.fn();
  preferences.subscribe(listener);
  preferences.update({ autoScrollEnabled: false });
  preferences.update({ input: { deviceId: "mic", channel: 1 } });
  expect(preferences.get()).toMatchObject({
    autoScrollEnabled: false,
    input: { deviceId: "mic", channel: 1 },
  });
  expect(listener).toHaveBeenCalledTimes(2);
});

test("falls back to defaults for malformed saved preferences", async () => {
  vi.stubGlobal("localStorage", { getItem: () => "{broken" });
  const { recorderPreferences } = await import("./storage");
  expect(recorderPreferences.get().autoScrollEnabled).toBe(true);
});
