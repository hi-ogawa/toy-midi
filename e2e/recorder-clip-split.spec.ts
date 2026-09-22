import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "../src/lib/recorder/persistence";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem, useFakeAudioInput } from "./helpers";
import {
  enableInput,
  saveRecorderProject,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("splits a moved, trimmed take without changing comp precedence and restores it through history and persistence", async ({
  page,
}) => {
  // Import an older trimmed take with a newer take covering its middle.
  await importTakes(page);
  const rows = page.getByTestId("recorder-take-row");
  const comp = page.getByTestId("recorder-clip-comp");
  const originalGeometry = await compGeometry(page);
  await expect(rows).toHaveCount(2);

  // Reject a cut before the clip, then select the older take and place the playhead inside it.
  await page
    .getByRole("button", { name: "Take 3 actions", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Split at playhead" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await takeClip(page, "Take 3").click();
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 6);
  await page.keyboard.press("s");

  // Keep the newer take audible and give the right piece its own selected row.
  await expect(rows).toHaveCount(3);
  await expect(takeClip(page, "Take 3 (split)")).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(await compGeometry(page)).toEqual(originalGeometry);
  await expect(comp.filter({ hasText: "Take 4" })).toHaveCount(1);
  const splitProject = await exportProject(page);
  const [left, right, newer] = splitProject.recordingTrack.takes;
  expect(left).toMatchObject({
    id: "older",
    name: "Take 3",
    timelineOffset: 1,
    trimStart: 0.5,
    trimEnd: 2,
  });
  expect(right).toMatchObject({
    name: "Take 3 (split)",
    timelineOffset: 1,
    trimStart: 2,
    trimEnd: 3.5,
  });
  expect(newer.id).toBe("newer");
  expect(splitProject.recordingTrack.nextTakeNumber).toBe(5);

  // Reject another cut at the selected piece's start without adding a history entry.
  await takeClip(page, "Take 3 (split)").click();
  await page.keyboard.press("s");
  await expect(rows).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(2);
  expect(await compGeometry(page)).toEqual(originalGeometry);
  await page.keyboard.press("Control+Shift+z");
  await expect(rows).toHaveCount(3);
  expect((await exportProject(page)).recordingTrack.takes).toEqual(
    splitProject.recordingTrack.takes,
  );

  // Delete only the right piece and undo to recover its independent placement.
  await takeClip(page, "Take 3 (split)").click();
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(2);
  await expect(comp.filter({ hasText: "Take 3 (split)" })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(3);

  // Save and reload both pieces, then split the right piece through its row menu.
  await saveRecorderProject(page);
  await page.reload();
  await page.getByTestId("recorder-takes-toggle").click();
  await expect(rows).toHaveCount(3);
  expect(await compGeometry(page)).toEqual(originalGeometry);
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 7);
  await selectMenuItem(page, {
    menu: "Take 3 (split) actions",
    item: "Split at playhead",
  });
  await expect(rows).toHaveCount(4);

  // Import the exported split arrangement and retain its clip identities and bounds.
  const archivePath = test.info().outputPath("split.toymidi.zip");
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (await chooser).setFiles(archivePath);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Split fixture",
  );
  expect((await exportProject(page)).recordingTrack.takes).toEqual(
    splitProject.recordingTrack.takes,
  );
});

test("does not split a take while recording and keeps the recording number independent of splits", async ({
  page,
}) => {
  // Load the take fixture and start a new recording inside the older take.
  await importTakes(page);
  await enableInput(page);
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 4);
  const rows = page.getByTestId("recorder-take-row");
  const record = page.getByTestId("recorder-record-button");
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));

  // Reject both the menu action and shortcut while capture is active.
  await page
    .getByRole("button", { name: "Take 3 actions", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Split at playhead" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await takeClip(page, "Take 3").click();
  await page.keyboard.press("s");
  await record.click();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "Take 5" })).toHaveCount(1);

  // Split a stopped take without consuming the next recording number.
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 6);
  await selectMenuItem(page, {
    menu: "Take 3 actions",
    item: "Split at playhead",
  });
  await expect(rows).toHaveCount(4);
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await record.click();
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: "Take 6" })).toHaveCount(1);
});

function takeClip(page: Page, name: string) {
  return page
    .getByTestId("recorder-take-row")
    .filter({
      has: page.getByRole("button", { name: `${name} actions`, exact: true }),
    })
    .getByTestId("recorder-clip-take-lane-source");
}

async function compGeometry(page: Page) {
  return page.getByTestId("recorder-clip-comp").evaluateAll((elements) =>
    elements.map((element) => {
      const style = (element as HTMLElement).style;
      return { left: style.left, width: style.width };
    }),
  );
}

async function exportProject(page: Page) {
  const download = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
  const path = test.info().outputPath("split.toymidi.zip");
  await (await download).saveAs(path);
  await page.keyboard.press("Escape");
  const zip = await JSZip.loadAsync(await readFile(path));
  return JSON.parse(
    await zip.file("project.json")!.async("string"),
  ) as SerializedRecorderRuntimeState<string>;
}

async function importTakes(page: Page) {
  const pcm = { sampleRate: 8000, channels: ["source.f32"] };
  const content: SerializedRecorderRuntimeState<string> = {
    title: "Split fixture",
    audioTracks: [],
    recordingTrack: {
      height: 116,
      gain: 1,
      muted: false,
      soloed: false,
      nextTakeNumber: 5,
      takes: [
        {
          id: "older",
          name: "Take 3",
          timelineOffset: 1,
          trimStart: 0.5,
          trimEnd: 3.5,
          pcm,
        },
        {
          id: "newer",
          name: "Take 4",
          timelineOffset: 2.5,
          trimStart: 0,
          trimEnd: 0.5,
          pcm,
        },
      ],
    },
    latencyCompensation: 0,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
  };
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({ formatVersion: 1, projectType: "recorder" }),
  );
  zip.file("project.json", JSON.stringify(content));
  zip.file(
    "source.f32",
    Buffer.from(
      Float32Array.from({ length: 32000 }, (_, i) => Math.sin(i / 10) * 0.2)
        .buffer,
    ),
  );
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (
    await chooser
  ).setFiles({
    name: "split.toymidi.zip",
    mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Split fixture",
  );
  await page.getByTestId("recorder-takes-toggle").click();
}
