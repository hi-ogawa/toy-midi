import path from "node:path";
import { test, type Locator, type Page } from "@playwright/test";

/** Call at file scope to enable a fake microphone for this test file. */
export function useFakeAudioInput({
  audioFilePath,
  requireUserGesture,
}: {
  audioFilePath?: string;
  // Keep Chromium's default autoplay policy for tests that depend on a user
  // gesture resuming the AudioContext.
  requireUserGesture?: boolean;
} = {}): void {
  test.use({
    permissions: ["microphone"],
    launchOptions: {
      // launchOptions replaces the config value, so retain the autoplay flag.
      args: [
        requireUserGesture
          ? "--autoplay-policy=user-gesture-required"
          : "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        // Chromium loops WAV input by default (%noloop plays once).
        // https://chromium.googlesource.com/chromium/src.git/+/cc79060bcce11b0cb6fafa673a2a20dcb12bd077/media/base/media_switches.cc
        ...(audioFilePath
          ? [`--use-file-for-fake-audio-capture=${path.resolve(audioFilePath)}`]
          : []),
      ],
    },
  });
}

/** Log elapsed checkpoints while investigating E2E timing. */
export function createCheckpoint(): (label: string) => void {
  const startedAt = performance.now();
  return (label) => {
    console.log(`[${Math.round(performance.now() - startedAt)}ms] ${label}`);
  };
}

/** Open a named menu and select one of its items. */
export async function selectMenuItem(
  page: Page,
  { menu, item }: { menu: string; item: string | RegExp },
): Promise<void> {
  await test.step(
    `Select ${item} from ${menu}`,
    async () => {
      await page.getByRole("button", { name: menu }).click();
      await page
        .getByRole("menu", { name: menu })
        .getByRole("menuitem", { name: item })
        .click();
    },
    { box: true },
  );
}

/** Set exact slider values through the component's change handler. */
export async function setSliderValue(
  slider: Locator,
  values: number[],
): Promise<void> {
  await test.step(
    `Set slider value to ${values.join(", ")}`,
    async () => {
      await slider.evaluate((element, detail) => {
        element
          .closest('[data-slot="slider"]')!
          .dispatchEvent(new CustomEvent("slider:set-value", { detail }));
      }, values);
    },
    { box: true },
  );
}
