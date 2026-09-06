import { expect, test } from "@playwright/test";
import { exportRecorderProjectArchive } from "../../src/lib/recorder/project-archive";

for (const gap of [0.25, 1e-13]) {
  test(`bounds comp waveform detail for a ${gap}s source fragment`, async ({
    page,
  }) => {
    // Two later takes leave a fragment of the original recording at 10 seconds.
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate * 20).fill(0.5);
    const archive = await exportRecorderProjectArchive({
      title: "Comp waveform range",
      audioTracks: [],
      recordingTrack: {
        height: 116,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [
          { timelineOffset: 0, trimEnd: 20 },
          { timelineOffset: 0, trimEnd: 10 },
          { timelineOffset: 10 + gap, trimEnd: 10 },
        ].map((take, index) => ({
          ...take,
          id: `take-${index}`,
          number: index + 1,
          trimStart: 0,
          pcm: { sampleRate, channels: [samples] },
        })),
      },
      latencyCompensation: 0,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "toy-midi:recorder-preferences",
        JSON.stringify({ timelinePixelsPerBeat: 3 }),
      );
    });
    await page.goto("/recorder");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("import-recorder-project").click();
    await (
      await chooser
    ).setFiles({
      name: "waveform-range.toymidi.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await archive.arrayBuffer()),
    });

    const regions = page.getByTestId("recorder-clip-comp");
    await expect(regions).toHaveCount(3);
    const fragment = regions.nth(1);
    await expect(fragment.locator("svg")).toBeVisible();
    const { points, width } = await fragment.evaluate((element) => ({
      points: element.querySelector("svg")!.viewBox.baseVal.width + 1,
      width: element.getBoundingClientRect().width,
    }));
    // Allow pooling/edge rounding, but never a source-length-sized SVG in a tiny clip.
    expect(points).toBeLessThanOrEqual(Math.ceil(width) * 2 + 2);
  });
}
