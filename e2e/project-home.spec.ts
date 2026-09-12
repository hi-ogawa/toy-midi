import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test("project tabs persist across reloads and visits with keyboard selection", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const midi = page.getByRole("tab", { name: "MIDI", exact: true });
  const recorder = page.getByRole("tab", { name: "Recorder", exact: true });
  await expect(midi).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No MIDI projects yet")).toBeVisible();

  await midi.focus();
  await midi.press("ArrowRight");
  await expect(recorder).toBeFocused();
  await expect(recorder).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No recorder projects yet")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.reload();
  await expect(recorder).toHaveAttribute("aria-selected", "true");

  const nextPage = await context.newPage();
  await nextPage.goto("/");
  await expect(
    nextPage.getByRole("tab", { name: "Recorder", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await nextPage.close();

  await recorder.focus();
  await recorder.press("Home");
  await expect(midi).toBeFocused();
  await page.reload();
  await expect(midi).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: test.info().outputPath("midi-home.png") });
});

test("both editors return to the shared project home", async ({ page }) => {
  await page.goto("/");
  await clickNewProject(page);
  const midiUrl = page.url();
  await page.getByTestId("app-menu-button").click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("tab", { name: "MIDI", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(`a[href="${new URL(midiUrl).pathname}"]`),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Recorder", exact: true }).click();
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  const recorderUrl = page.url();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("tab", { name: "Recorder", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const recording = page.locator(`a[href="${new URL(recorderUrl).pathname}"]`);
  await expect(recording).toBeVisible();
  await expect(
    page.locator(`a[href="${new URL(midiUrl).pathname}"]`),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("recorder-home.png") });
  await recording.click();
  await expect(page).toHaveURL(recorderUrl);
});
