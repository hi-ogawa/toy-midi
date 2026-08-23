import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./helpers";

test("saves and restores a recorder project", async ({ page }) => {
  await createRecorderProject(page);
  const projectUrl = page.url();

  page.once("dialog", (dialog) => dialog.accept("Practice take"));
  await page.getByTestId("recorder-project-name").click();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  await page.getByTestId("recorder-tempo-input").fill("140");
  await page.getByTestId("recorder-tempo-input").press("Enter");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Save/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+S");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Save/ })).toBeDisabled();

  await page.reload();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );
  await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("140");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  await page.goto("/recorder");
  const project = page.getByText("Practice take", { exact: true });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );

  await page.goto("/recorder");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete recording" }).click();
  await expect(page.getByText("Practice take", { exact: true })).toBeHidden();
});
