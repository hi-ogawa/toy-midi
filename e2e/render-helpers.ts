import { type BrowserContext, type JSHandle, test } from "@playwright/test";
import type { SharedProject } from "../src/lib/project-share";

/**
 * A rendered mix kept in its own page, so the samples never pass through
 * `page.evaluate` results, which Playwright records in the trace.
 */
export type RenderedMix = JSHandle<AudioBuffer>;

/** Render a project's mix the way Export Audio does, without the dialog. */
export async function renderProject(
  context: BrowserContext,
  project: SharedProject,
): Promise<RenderedMix> {
  return await test.step(
    "Render project",
    async () => {
      const page = await context.newPage();
      await page.goto("/editor-cli");
      await page.waitForFunction(() => window.toyMidi.runtime);
      return await page.evaluateHandle(async (project) => {
        const { runtime, utils } = window.toyMidi;
        await runtime!.init();
        await runtime!.deserializeProject(utils.convertSharedProject(project));
        return await runtime!.renderMix();
      }, project);
    },
    { box: true },
  );
}

/** RMS level over every channel between two times in seconds. */
export async function measureRmsDb(
  mix: RenderedMix,
  range: { start: number; end: number },
): Promise<number> {
  return await mix.evaluate((buffer, { start, end }) => {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const samples = buffer
        .getChannelData(i)
        .subarray(
          Math.round(start * buffer.sampleRate),
          Math.round(end * buffer.sampleRate),
        );
      for (const sample of samples) {
        sum += sample * sample;
      }
      count += samples.length;
    }
    return 10 * Math.log10(sum / count);
  }, range);
}
