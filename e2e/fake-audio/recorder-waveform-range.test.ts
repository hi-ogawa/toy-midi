import { expect, test } from "@playwright/test";
import { exportRecorderProjectArchive } from "../../src/lib/recorder/project-archive";
import { dragBy } from "./recorder-helpers";

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
          { timelineOffset: 10 + gap, trimEnd: 5 },
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
    await expect(regions).toHaveCount(4);
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
    // Coarse culling may add up to 256 px at either edge, but does not change scale.
    expect(width).toBe(2);
    const bucketDuration = 133 / 800;
    expect(points).toBeLessThanOrEqual(
      Math.ceil((width + 512) / (bucketDuration * 6)) + 2,
    );
    expect(waveformWidth).toBeLessThanOrEqual(width + 512 + 2);
    expect(pointSpacing).toBeCloseTo(bucketDuration * 6, 1);

    // Moving the later take changes both old-take fragments, but not their
    // queried paths/viewBoxes while their edges remain in the same culling window.
    const right = regions.nth(3);
    const beforeLeft = await right.evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    const path = await right.locator("svg path").getAttribute("d");
    const viewBox = await right.locator("svg").getAttribute("viewBox");
    await dragBy(page, page.getByTestId("recorder-clip-take").nth(2), 8);
    await expect
      .poll(() =>
        right.evaluate((element) => element.getBoundingClientRect().left),
      )
      .toBeGreaterThan(beforeLeft + 7);
    await expect(right.locator("svg path")).toHaveAttribute("d", path!);
    await expect(right.locator("svg")).toHaveAttribute("viewBox", viewBox!);
  });
}
