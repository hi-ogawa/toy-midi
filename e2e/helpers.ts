import type { Page } from "@playwright/test";
import type { useProjectStore } from "../src/stores/project-store";

// Type for the exposed store on window
type StoreType = typeof useProjectStore;

declare global {
  interface Window {
    __store?: StoreType;
  }
}

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
