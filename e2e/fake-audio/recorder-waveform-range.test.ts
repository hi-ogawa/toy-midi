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
    await expect(fragment.locator("svg")).toHaveCount(1);
    const { points, width, waveformWidth, pointSpacing } =
      await fragment.evaluate((element) => ({
        points:
          element.querySelector("path")!.getAttribute("d")!.split(" L ")
            .length / 2,
        width: element.getBoundingClientRect().width,
        waveformWidth: element.querySelector("svg")!.getBoundingClientRect()
          .width,
        pointSpacing: element.querySelector("svg")!.getScreenCTM()!.a,
      }));
    // Allow pooling/edge rounding, but never a source-length-sized SVG in a tiny clip.
    expect(points).toBeLessThanOrEqual(Math.ceil(width) * 2 + 2);
    // The 2 px clip box must not stretch the waveform beyond the timeline scale.
    // At 120 BPM and 3 px/beat, pooling uses 133 source points per pixel.
    // The SVG covers complete source-aligned buckets, even for a subpixel clip.
    expect(width).toBe(2);
    const bucketDuration = 133 / 800;
    const startPixel = Math.floor(10 / bucketDuration) * bucketDuration * 6;
    const endPixel =
      Math.ceil((10 + gap) / bucketDuration) * bucketDuration * 6;
    expect(waveformWidth).toBe(Math.ceil(endPixel) - Math.floor(startPixel));
    expect(pointSpacing).toBeCloseTo(bucketDuration * 6, 1);
  });
}
