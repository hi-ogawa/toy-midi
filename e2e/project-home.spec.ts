import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test("project tabs persist across reloads and visits", async ({
  page,
  context,
}) => {
  // A first visit starts on MIDI and shows its empty project list.
  await page.goto("/");
  const midi = page.getByRole("tab", { name: "MIDI", exact: true });
  const recorder = page.getByRole("tab", { name: "Recorder", exact: true });
  await expect(midi).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No MIDI projects yet")).toBeVisible();

  // Click Recorder to switch project lists without leaving the home URL.
  await recorder.click();
  await expect(recorder).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No recorder projects yet")).toBeVisible();
  await expect(page).toHaveURL("/");

  // Reloading restores the selected project type.
  await page.reload();
  await expect(recorder).toHaveAttribute("aria-selected", "true");

  // A new browser tab picks up the same saved preference.
  const nextPage = await context.newPage();
  await nextPage.goto("/");
  await expect(
    nextPage.getByRole("tab", { name: "Recorder", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await nextPage.close();

  // Click MIDI and confirm it becomes the default for the next visit.
  await midi.click();
  await expect(midi).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(midi).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: test.info().outputPath("midi-home.png") });
});

test("both editors return to the shared project home", async ({ page }) => {
  // Create a MIDI project from the shared home.
  await page.goto("/");
  await clickNewProject(page);
  const midiUrl = page.url();

  // The editor's Home action returns to MIDI with the new project listed.
  await page.getByTestId("app-menu-button").click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("tab", { name: "MIDI", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(`a[href="${new URL(midiUrl).pathname}"]`),
  ).toBeVisible();

  // Switch workflows and create a recorder project from the same page.
  await page.getByRole("tab", { name: "Recorder", exact: true }).click();
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  const recorderUrl = page.url();

  // Recorder's Home action restores its list, with MIDI projects hidden.
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

  // Opening the listed recording returns to that same project.
  await recording.click();
  await expect(page).toHaveURL(recorderUrl);
});
