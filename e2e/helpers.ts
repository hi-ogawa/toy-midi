import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type {} from "../src/api";

declare global {
  interface Window {
    __e2eSentMidi: number[][];
    __e2eOutputAnalyser: AnalyserNode;
  }
}

/** Call at file scope to enable a fake microphone for this test file. */
export function useFakeAudioInput({
  audioFilePath,
}: { audioFilePath?: string } = {}): void {
  test.use({
    permissions: ["microphone"],
    launchOptions: {
      // launchOptions replaces the config value, so retain the autoplay flag.
      args: [
        "--autoplay-policy=no-user-gesture-required",
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

/** Playwright has no virtual MIDI device, so this replaces the browser's access. */
export async function installFakeMidiDevice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const setConnection = async (connection: string) => {
      input.connection = connection;
      access.dispatchEvent(new Event("statechange"));
      return input;
    };
    const input = Object.assign(new EventTarget(), {
      id: "fake-keyboard",
      name: "Fake Keyboard",
      state: "connected",
      connection: "closed",
      open: () => setConnection("open"),
      close: () => setConnection("closed"),
    });
    const access = Object.assign(new EventTarget(), {
      inputs: new Map([[input.id, input]]),
    });
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess;
  });
}

/** Replaces the browser's access with one output that records what it is sent. */
export async function installFakeMidiOutput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__e2eSentMidi = [];
    const output = {
      id: "fake-output",
      name: "Fake Output",
      state: "connected",
      send: (bytes: number[]) => window.__e2eSentMidi.push(bytes),
    };
    navigator.requestMIDIAccess = async () =>
      ({
        outputs: new Map([[output.id, output]]),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MIDIAccess;
  });
}

/** Connect an analyser to the master output, which is the mix the speakers play. */
export async function tapMasterOutput(page: Page): Promise<void> {
  await page.waitForFunction(() => window.toyMidi.runtime);
  await page.evaluate(() => {
    const { masterOutput } = window.toyMidi.runtime!;
    const analyser = masterOutput.context.createAnalyser();
    masterOutput.connect(analyser);
    window.__e2eOutputAnalyser = analyser;
  });
}

/** Wait until the tapped master output sounds. */
export async function expectSound(page: Page): Promise<void> {
  await test.step(
    "Expect sound",
    async () => {
      await expect.poll(() => getOutputPeak(page)).toBeGreaterThan(0.001);
    },
    { box: true },
  );
}

/** Wait until the tapped master output is silent. */
export async function expectSilence(page: Page): Promise<void> {
  await test.step(
    "Expect silence",
    async () => {
      await expect.poll(() => getOutputPeak(page)).toBe(0);
    },
    { box: true },
  );
}

async function getOutputPeak(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const analyser = window.__e2eOutputAnalyser;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
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
      const menuItem = await getMenuItem(page, { menu, item });
      await menuItem.click();
    },
    { box: true },
  );
}

/** Open a named menu and return an item locator. */
export async function getMenuItem(
  page: Page,
  { menu, item }: { menu: string; item: string | RegExp },
): Promise<Locator> {
  return test.step(
    `Get ${item} from ${menu}`,
    async () => {
      await page.getByRole("button", { name: menu }).click();
      const menuLocator = page.getByRole("menu", { name: menu });
      return menuLocator
        .getByRole("menuitem", { name: item })
        .or(menuLocator.getByRole("menuitemcheckbox", { name: item }));
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
