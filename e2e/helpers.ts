import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { AudioDebugInterface } from "../src/lib/audio";
import type { useProjectStore } from "../src/stores/project-store";

// Type for the exposed store on window
type StoreType = typeof useProjectStore;

declare global {
  interface Window {
    __store?: StoreType;
  }
}

/**
 * Click "New Project" on startup screen to get to main UI with empty state.
 */
export async function clickNewProject(page: Page): Promise<void> {
  await page.getByTestId("new-project-button").click();
  await page.getByTestId("transport").waitFor({ state: "visible" });
}

/**
 * Click "Continue" on startup screen to restore saved project.
 */
export async function clickContinue(page: Page): Promise<void> {
  await page.getByTestId("continue-button").click();
  await page.getByTestId("transport").waitFor({ state: "visible" });
}

/** @deprecated Use clickNewProject instead */
export const clickThroughStartup = clickNewProject;

/**
 * Evaluate a function against the Zustand store in the browser context.
 * Only available in dev mode where window.__store is exposed.
 *
 * @example
 * // Read state
 * const notes = await evaluateStore(page, (store) => store.getState().notes);
 *
 * // Mutate state
 * await evaluateStore(page, (store) => {
 *   store.getState().addNote({ id: 'n1', pitch: 48, start: 0, duration: 1 });
 * });
 */
export async function evaluateStore<T>(
  page: Page,
  fn: (store: StoreType) => T,
): Promise<T> {
  return page.evaluate((fnStr) => {
    const store = (window as Window & { __store?: StoreType }).__store;
    if (!store) {
      throw new Error(
        "window.__store not available. Is the app running in dev mode?",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const evalFn = new Function("store", `return (${fnStr})(store)`);
    return evalFn(store) as T;
  }, fn.toString());
}

// Audio debug helpers

type AudioChannel = "midi" | "audio" | "metronome";

export async function getAudioState(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & { __audioDebug?: AudioDebugInterface })
      .__audioDebug;
    if (!debug) throw new Error("__audioDebug not available");
    return debug.getState();
  });
}

export async function isChannelPlaying(
  page: Page,
  channel: AudioChannel,
): Promise<boolean> {
  return page.evaluate((ch) => {
    const debug = (window as Window & { __audioDebug?: AudioDebugInterface })
      .__audioDebug;
    if (!debug) throw new Error("__audioDebug not available");
    return debug.isChannelPlaying(ch);
  }, channel);
}

/**
 * Wait for audio to be detected on a specific channel (non-silent output).
 * Polls repeatedly since audio may take time to start.
 */
export async function expectChannelPlaying(
  page: Page,
  channel: AudioChannel,
  timeout = 2000,
) {
  await expect
    .poll(() => isChannelPlaying(page, channel), {
      timeout,
      message: `Expected ${channel} channel to be playing (non-silent)`,
    })
    .toBe(true);
}

export async function expectChannelSilent(page: Page, channel: AudioChannel) {
  const playing = await isChannelPlaying(page, channel);
  expect(playing).toBe(false);
}
