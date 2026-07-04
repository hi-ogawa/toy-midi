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
 * Load an audio file via Settings dialog.
 * Opens Settings, uploads test-audio.wav under the given file name, waits for
 * load, then closes Settings.
 */
export async function loadAudioFile(
  page: Page,
  fileName = "test-audio.wav",
): Promise<void> {
  // Open settings dialog
  await page.getByTestId("settings-button").click();
  await page.waitForTimeout(100);

  // Find audio file input within settings dialog
  const fileInput = page.getByTestId("audio-file-input");
  const fs = await import("fs/promises");
  const path = await import("path");
  const testAudioPath = path.join(
    import.meta.dirname,
    "../public/test-audio.wav",
  );
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: "audio/wav",
    buffer: await fs.readFile(testAudioPath),
  });
  await page.waitForTimeout(500); // Wait for audio to load

  // Close settings dialog
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
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
