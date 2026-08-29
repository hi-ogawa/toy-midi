import { expect, test } from "@playwright/test";
import { createRecorderProject } from "../helpers";

test("saves and restores a recorder project", async ({ page }) => {
  // The musician creates a project and gives it a recognizable name.
  await createRecorderProject(page);
  const projectUrl = page.url();
  await expect(
    page.getByRole("button", { name: "All changes saved" }),
  ).toHaveAttribute("aria-disabled", "true");
  const saveButton = page.getByRole("button", { name: "All changes saved" });
  const saveTooltip = page.getByRole("tooltip");
  await expect(saveButton).not.toHaveAttribute("title");
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.hover();
  await expect(saveTooltip).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.focus();
  await expect(saveTooltip).toHaveCSS("opacity", "1");

  // Transport updates are session state and do not stale persisted state.
  await page.getByTestId("recorder-play-button").click();
  await expect(page.getByTestId("recorder-position")).not.toHaveText(
    "1.1 - 0:00.000",
  );
  await page.getByTestId("recorder-play-button").click();
  await expect(
    page.getByRole("button", { name: "All changes saved" }),
  ).toHaveAttribute("aria-disabled", "true");

  page.once("dialog", (dialog) => dialog.accept("Practice take"));
  await page.getByTestId("recorder-project-name").click();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );

  // They load a backing track, including its decoded waveform.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Editing marks the project dirty, and Ctrl+S saves it without browser UI.
  await page.getByTestId("recorder-tempo-input").fill("140");
  await page.getByTestId("recorder-tempo-input").press("Enter");
  await page.getByTestId("recorder-reference-video-button").click();
  const referencePanel = page.getByTestId("recorder-youtube-reference");
  await referencePanel
    .getByTestId("recorder-youtube-input")
    .fill("dQw4w9WgXcQ");
  await referencePanel.getByRole("button", { name: "Add video" }).click();
  const referenceClip = page.getByTestId("recorder-clip-reference");
  const referenceClipBox = await referenceClip.boundingBox();
  expect(referenceClipBox).not.toBeNull();
  const referenceDragX = referenceClipBox!.x + 20;
  await page.mouse.move(
    referenceDragX,
    referenceClipBox!.y + referenceClipBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    referenceDragX + 80,
    referenceClipBox!.y + referenceClipBox!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(referenceClip).toContainText(/\+\d+\.\d{3}s/);
  const referenceOffset = await referenceClip
    .getByText(/\+\d+\.\d{3}s/)
    .textContent();
  expect(referenceOffset).not.toBeNull();
  await page.getByTestId("recorder-reference-video-mute").click();
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  const metronomeLevel = page.getByRole("textbox", {
    name: "Metronome level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await metronomeLevel.fill("-9");
  await metronomeLevel.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Unsaved changes (Ctrl/Cmd+S to save)",
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Unsaved changes (Ctrl/Cmd+S to save)" })
    .click();
  await expect(
    page.getByRole("button", { name: "All changes saved" }),
  ).toHaveAttribute("aria-disabled", "true");

  // Reload restores document fields and PCM-backed waveform data.
  await page.reload();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );
  await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("140");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();
  await expect(page.getByTestId("recorder-reference-track")).toBeVisible();
  await expect(page.getByTestId("recorder-clip-reference")).toContainText(
    referenceOffset!,
  );
  await expect(
    page.getByTestId("recorder-reference-video-mute"),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
  await expect(
    page.getByRole("textbox", { name: "Metronome level in dB" }),
  ).toHaveValue("-9.0");

  // The metadata index finds the saved project and reopens the same route.
  await page.goto("/recorder");
  const project = page.getByText("Practice take", { exact: true });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );

  // Deleting from the index removes the project metadata and content.
  await page.goto("/recorder");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete recording" }).click();
  await expect(page.getByText("Practice take", { exact: true })).toBeHidden();

  // A stale deep link reports the missing project without retrying its read.
  await page.goto(projectUrl);
  await expect(page.getByText(/Recorder project .* not found/)).toBeVisible();
});
