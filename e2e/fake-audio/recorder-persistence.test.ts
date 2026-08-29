import { expect, test } from "@playwright/test";
import { createRecorderProject } from "../helpers";

test("saves and restores a recorder project", async ({ page }) => {
  // The musician creates a project and gives it a recognizable name.
  await createRecorderProject(page);
  const projectUrl = page.url();
  await expect(
    page.getByRole("button", { name: "All changes saved" }),
  ).toHaveAttribute("aria-disabled", "true");

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
  await referencePanel
    .getByTestId("recorder-reference-timeline-start")
    .fill("-2.5");
  await referencePanel.getByTestId("recorder-reference-video-mute").click();
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
  await page.getByTestId("recorder-reference-video-button").click();
  await expect(
    page
      .getByTestId("recorder-youtube-reference")
      .getByTestId("recorder-reference-timeline-start"),
  ).toHaveValue("-2.5");
  await expect(
    page
      .getByTestId("recorder-youtube-reference")
      .getByTestId("recorder-reference-video-mute"),
  ).toHaveAttribute("aria-pressed", "true");

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
