import { expect, type Page, test } from "@playwright/test";
import { addRecorderAudio, createRecorderProject } from "./recorder-helpers";

const BLOCK_FRAMES = 128;
const SILENCE_PEAK = 0.01;

type OutputTapWindow = { __outputBlocks: [frame: number, peak: number][] };

test.beforeEach(async ({ page }) => {
  // Tap every AudioContext output on the audio thread, recording the peak of
  // each render block so main-thread load cannot drop or blank any of them.
  await page.addInitScript(() => {
    const processor = `
      registerProcessor("output-tap", class extends AudioWorkletProcessor {
        process([input]) {
          let peak = 0;
          for (const data of input) {
            for (const sample of data) {
              peak = Math.max(peak, Math.abs(sample));
            }
          }
          this.port.postMessage([currentFrame, peak]);
          return true;
        }
      });
    `;
    const moduleUrl = URL.createObjectURL(
      new Blob([processor], { type: "text/javascript" }),
    );
    const blocks: OutputTapWindow["__outputBlocks"] = [];
    Object.assign(window, { __outputBlocks: blocks });
    const descriptor = Object.getOwnPropertyDescriptor(
      BaseAudioContext.prototype,
      "destination",
    )!;
    const taps = new WeakMap<BaseAudioContext, GainNode>();
    Object.defineProperty(BaseAudioContext.prototype, "destination", {
      get(this: BaseAudioContext) {
        const destination = descriptor.get!.call(this) as AudioNode;
        if (!(this instanceof AudioContext)) {
          return destination;
        }
        let tap = taps.get(this);
        if (!tap) {
          const input = this.createGain();
          input.connect(destination);
          void this.audioWorklet.addModule(moduleUrl).then(() => {
            const node = new AudioWorkletNode(this, "output-tap");
            node.port.onmessage = ({ data }) => blocks.push(data);
            input.connect(node).connect(destination);
          });
          tap = input;
          taps.set(this, tap);
        }
        return tap;
      },
    });
  });
});

// The loop is the first bar, 2s of timeline at the default 120 BPM.
const LOOP_SECONDS = 2;

// Above 1x the clip also runs through the pitch shifter.
for (const playbackRate of [1, 1.5]) {
  test(`loops an audio clip without a gap at the wrap at ${playbackRate}x`, async ({
    page,
  }) => {
    await createRecorderProject(page);

    // Load a steady 3s sine and loop the first bar inside it.
    await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
    await page.getByTestId("recorder-loop-toggle").click();
    await expect(page.getByTestId("recorder-loop-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (playbackRate !== 1) {
      await page.getByTestId("recorder-playback-rate").click();
      await page
        .getByRole("menuitemradio", { name: `${playbackRate}x` })
        .click();
    }

    // Play through three loop wraps, then stop.
    const passSeconds = LOOP_SECONDS / playbackRate;
    const playButton = page.getByTestId("recorder-play-button");
    await page.evaluate(() => {
      (window as unknown as OutputTapWindow).__outputBlocks.length = 0;
    });
    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout((3 * passSeconds + 0.5) * 1000);
    await playButton.click();

    // Every render block between the first and last sound stays audible.
    const blocks = await readOutputBlocks(page);
    const first = blocks.findIndex(([, peak]) => peak >= SILENCE_PEAK);
    const last = blocks.findLastIndex(([, peak]) => peak >= SILENCE_PEAK);
    const audible = blocks.slice(first, last + 1);
    const sampleRate = await page.evaluate(() => new AudioContext().sampleRate);
    expect(audible.length * BLOCK_FRAMES).toBeGreaterThan(
      sampleRate * 3 * passSeconds,
    );
    const silentFrames = audible.flatMap(([frame, peak]) =>
      peak < SILENCE_PEAK ? [frame] : [],
    );
    expect(silentFrames).toEqual([]);
  });
}

function readOutputBlocks(page: Page) {
  return page.evaluate(
    () => (window as unknown as OutputTapWindow).__outputBlocks,
  );
}
