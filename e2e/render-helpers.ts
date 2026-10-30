import type { Page } from "@playwright/test";
import type { SharedProject } from "../src/lib/project-share";
import type {} from "../src/page-global";

export type RenderedMix = { sampleRate: number; channels: Float32Array[] };

/** Render a project's mix the way Export Audio does, without the dialog. */
export async function renderProject(
  page: Page,
  project: SharedProject,
): Promise<RenderedMix> {
  await page.goto("/editor-cli");
  await page.waitForFunction(() => window.toyMidi.runtime);
  const { sampleRate, channels } = await page.evaluate(async (project) => {
    const { runtime, utils } = window.toyMidi;
    await runtime!.init();
    await runtime!.deserializeProject(utils.convertSharedProject(project));
    const buffer = await runtime!.renderMix();
    return {
      sampleRate: buffer.sampleRate,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        Array.from(buffer.getChannelData(i)),
      ),
    };
  }, project);
  return {
    sampleRate,
    channels: channels.map((channel) => Float32Array.from(channel)),
  };
}

/** RMS level over every channel between two times in seconds. */
export function measureRmsDb(
  mix: RenderedMix,
  { start, end }: { start: number; end: number },
): number {
  let sum = 0;
  let count = 0;
  for (const channel of mix.channels) {
    const samples = channel.subarray(
      Math.round(start * mix.sampleRate),
      Math.round(end * mix.sampleRate),
    );
    for (const sample of samples) {
      sum += sample * sample;
    }
    count += samples.length;
  }
  return 10 * Math.log10(sum / count);
}
