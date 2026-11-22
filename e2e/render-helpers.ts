import type { Page } from "@playwright/test";
import type { SharedProject } from "../src/lib/project-share";

const BLOCKS_PER_SECOND = 100;

/**
 * Each channel's sum of squared samples per 10 ms block. Playwright records
 * `page.evaluate` results in the trace, so a render returns these few hundred
 * numbers rather than the samples.
 */
export type RenderedMix = { blockLength: number; channels: number[][] };

/** Render a project's mix the way Export Audio does, without the dialog. */
export async function renderProject(
  page: Page,
  project: SharedProject,
): Promise<RenderedMix> {
  await page.goto("/editor-cli");
  await page.waitForFunction(() => window.toyMidi.runtime);
  return page.evaluate(
    async ({ project, blocksPerSecond }) => {
      const { runtime, utils } = window.toyMidi;
      await runtime!.init();
      await runtime!.deserializeProject(utils.convertSharedProject(project));
      const buffer = await runtime!.renderMix();
      const blockLength = buffer.sampleRate / blocksPerSecond;
      const blockCount = Math.floor(buffer.length / blockLength);
      return {
        blockLength,
        channels: Array.from({ length: buffer.numberOfChannels }, (_, i) => {
          const samples = buffer.getChannelData(i);
          return Array.from({ length: blockCount }, (_, block) => {
            let sum = 0;
            for (
              let j = block * blockLength;
              j < (block + 1) * blockLength;
              j++
            ) {
              sum += samples[j] * samples[j];
            }
            return sum;
          });
        }),
      };
    },
    { project, blocksPerSecond: BLOCKS_PER_SECOND },
  );
}

/**
 * RMS level over every channel between two times in seconds, rounded to 10 ms
 * blocks.
 */
export function measureRmsDb(
  mix: RenderedMix,
  { start, end }: { start: number; end: number },
): number {
  let sum = 0;
  let count = 0;
  for (const channel of mix.channels) {
    const blocks = channel.slice(
      Math.round(start * BLOCKS_PER_SECOND),
      Math.round(end * BLOCKS_PER_SECOND),
    );
    for (const block of blocks) {
      sum += block;
    }
    count += blocks.length * mix.blockLength;
  }
  return 10 * Math.log10(sum / count);
}
