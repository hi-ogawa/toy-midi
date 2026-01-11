import type { Page } from "@playwright/test";
import type * as Tone from "tone";
import type { useProjectStore } from "../src/stores/project-store";

// Type for the exposed store on window
type StoreType = typeof useProjectStore;
type ToneType = typeof Tone;

declare global {
  interface Window {
    __store?: StoreType;
    Tone?: ToneType;
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

/**
 * Evaluate a function against Tone.js Transport in the browser context.
 * Only available in dev mode where window.Tone is exposed.
 *
 * @example
 * // Get transport state
 * const state = await evaluateTone(page, (Tone) => Tone.getTransport().state);
 * // Returns "started", "paused", or "stopped"
 *
 * // Get transport position
 * const position = await evaluateTone(page, (Tone) => Tone.getTransport().seconds);
 */
export async function evaluateTone<T>(
  page: Page,
  fn: (Tone: ToneType) => T,
): Promise<T> {
  return page.evaluate((fnStr) => {
    const Tone = (window as Window & { Tone?: ToneType }).Tone;
    if (!Tone) {
      throw new Error(
        "window.Tone not available. Is the app running in dev mode?",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const evalFn = new Function("Tone", `return (${fnStr})(Tone)`);
    return evalFn(Tone) as T;
  }, fn.toString());
}
