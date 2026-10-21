import type { Page } from "@playwright/test";
import type {} from "../src/lib/cli-api";
import type { SharedProject } from "../src/lib/project-share";

export type Render = { sampleRate: number; channels: Float32Array[] };

/** Render a project's mix the way Export Audio does, without the dialog. */
export async function renderProject(
  page: Page,
  project: SharedProject,
): Promise<Render> {
  await page.goto("/editor-cli");
  await page.waitForFunction(() => window.__toyMidiCli?.editor);
  const { sampleRate, channels } = await page.evaluate(async (project) => {
    const { editor: runtime, editorUtils: utils } = window.__toyMidiCli!;
    await runtime!.init();
    await runtime!.deserializeProject(utils!.convertSharedProject(project));
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
  render: Render,
  { start, end }: { start: number; end: number },
): number {
  let sum = 0;
  let count = 0;
  for (const channel of render.channels) {
    const samples = channel.subarray(
      Math.round(start * render.sampleRate),
      Math.round(end * render.sampleRate),
    );
    for (const sample of samples) {
      sum += sample * sample;
    }
    count += samples.length;
  }
  return 10 * Math.log10(sum / count);
}
