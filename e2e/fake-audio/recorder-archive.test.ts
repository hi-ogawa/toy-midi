import { expect, type Page, test } from "@playwright/test";
import { createRecorderProject } from "../helpers";
import {
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

test.beforeEach(async ({ page }) => {
  await createRecorderProject(page);
});

test("exports and imports a recorder project archive", async ({ page }) => {
  // Build an editable project with backing audio and two retained takes.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  for (const position of [160, 320]) {
    await seekRecorderByPixels(page, position);
    await recordButton.click();
    await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
    await recordButton.click();
  }
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(2);
  const clipGeometry = await getRecorderClipGeometry(page);
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await page.getByRole("button", { name: "Close Mixer" }).click();

  // Export the open project and retain the downloaded archive for import.
  page.once("dialog", (dialog) => dialog.accept("Archived recording"));
  await page.getByTestId("recorder-project-name").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByTestId("recorder-export-project").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.toymidi\.zip$/);
  const archivePath = test.info().outputPath("recorder.toymidi.zip");
  await download.saveAs(archivePath);

  // Import from the project list, which opens a newly created local project.
  await page.goto("/recorder");
  const importChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (await importChooserPromise).setFiles(archivePath);

  // Verify the imported project preserves its editable audio and comp state.
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Archived recording",
  );
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(2);
  await expect(page.getByTestId("recorder-clip-comp")).toHaveCount(2);
  await expect.poll(() => getRecorderClipGeometry(page)).toEqual(clipGeometry);
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
});

async function getRecorderClipGeometry(page: Page) {
  const geometry = await Promise.all(
    (["audio", "take", "comp"] as const).map(async (variant) => ({
      variant,
      clips: await page
        .getByTestId(`recorder-clip-${variant}`)
        .evaluateAll((elements) =>
          elements.map((element) => ({
            left: (element as HTMLElement).style.left,
            width: (element as HTMLElement).style.width,
          })),
        ),
    })),
  );
  return geometry;
}
