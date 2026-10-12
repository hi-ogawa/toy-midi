import { expect, type Page, test } from "@playwright/test";
import {
  addMidiTrack,
  createMidiNote,
  createProject,
  getMidiNote,
  saveProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("shares a MIDI project as a link that opens an unsaved demo", async ({
  page,
}) => {
  // Create a project with a note and its own tempo, and save it.
  await createProject(page);
  const projectUrl = page.url();
  const track = page.getByTestId("midi-track-row");
  await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });
  const tempo = page.getByTestId("tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await saveProject(page);

  // Copy a share link from the editor menu, and get a link to the demo route.
  const shareUrl = await copyShareLink(page);
  expect(new URL(shareUrl).pathname).toBe("/demo");

  // Open the link, and see the project as a demo with no save button.
  await page.goto(shareUrl);
  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveText("Untitled");
  await expect(getMidiNote(track, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(tempo).toHaveValue("90");
  await expect(page.getByTestId("save-button")).toHaveCount(0);

  // Go home, and see that opening the demo stored nothing.
  await page.goto("/");
  const projects = page
    .getByRole("region", { name: "Current projects" })
    .getByRole("link");
  await expect(projects).toHaveCount(1);

  // Open the demo again, add a note, and copy it to a project of its own.
  await page.goto(shareUrl);
  await createMidiNote(page, track, { beat: 1, pitch: "E4" });
  await page.getByTestId("copy-to-save-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  expect(page.url()).not.toBe(projectUrl);
  await expect(page.getByTestId("demo-badge")).toHaveCount(0);
  await expect(page.getByTestId("save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  await expect(getMidiNote(track, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(getMidiNote(track, { beat: 1, pitch: "E4" })).toBeVisible();
  await page.goto("/");
  await expect(projects).toHaveCount(2);

  // Change the copy's tempo and share it, then open both links in turn in
  // this tab, which only changes the hash, and see each demo's own tempo.
  await projects.first().click();
  await expect(getMidiNote(track, { beat: 1, pitch: "E4" })).toBeVisible();
  await tempo.fill("140");
  await tempo.press("Enter");
  await saveProject(page);
  const secondShareUrl = await copyShareLink(page);
  await page.goto(shareUrl);
  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await expect(tempo).toHaveValue("90");
  await page.goto(secondShareUrl);
  await expect(tempo).toHaveValue("140");
  await expect(getMidiNote(track, { beat: 1, pitch: "E4" })).toBeVisible();

  // Open a link whose payload was cut short, and get told it cannot open.
  await page.goto(shareUrl.slice(0, -20));
  await expect(page.getByText("Could not open this project")).toBeVisible();
  await expect(
    page.getByText("The share link does not hold a readable project."),
  ).toBeVisible();

  // Open the demo route with no payload at all, and get sent home.
  await page.goto("/demo");
  await expect(
    page.getByText("This share link has no project in it."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to projects" }).click();
  await expect(projects).toHaveCount(2);
});

async function copyShareLink(page: Page) {
  await selectMenuItem(page, { menu: "Editor menu", item: "Copy Share Link" });
  await expect(page.getByText("Share link copied")).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain("/demo#p=");
  return url;
}
