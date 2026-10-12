import { expect, type Page, test } from "@playwright/test";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
  getMidiNote,
  saveProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("shares a MIDI project as a link that opens an unsaved draft", async ({
  page,
}) => {
  // Create a project with a backing track, a note, and its own tempo, and
  // save it.
  await createProject(page);
  const projectUrl = page.url();
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  await expect(page.getByTestId("clip-audio")).toHaveCount(1);
  const track = page.getByTestId("midi-track-row");
  await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });
  const tempo = page.getByTestId("tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await saveProject(page);

  // Copy a share link from the editor menu.
  const shareUrl = await copyShareLink(page);

  // Open the link, and see the project's MIDI as a draft with no save button,
  // and without the audio, which a link does not carry.
  await page.goto(shareUrl);
  await expect(page.getByTestId("draft-badge")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveText("Untitled");
  await expect(getMidiNote(track, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(tempo).toHaveValue("90");
  await expect(page.getByTestId("save-button")).toHaveCount(0);
  await expect(page.getByTestId("audio-track-row")).toHaveCount(0);

  // Go home, and see that opening the draft stored nothing.
  await page.goto("/");
  const projects = page
    .getByRole("region", { name: "Current projects" })
    .getByRole("link");
  await expect(projects).toHaveCount(1);

  // Open the draft again, add a note, and save it as a project of its own.
  await page.goto(shareUrl);
  await createMidiNote(page, track, { beat: 1, pitch: "E4" });
  await page.getByTestId("save-draft-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  expect(page.url()).not.toBe(projectUrl);
  await expect(page.getByTestId("draft-badge")).toHaveCount(0);
  await expect(page.getByTestId("save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  await expect(getMidiNote(track, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(getMidiNote(track, { beat: 1, pitch: "E4" })).toBeVisible();
  await page.goto("/");
  await expect(projects).toHaveCount(2);

  // Change the copy's tempo and share it, then open both links in turn in
  // this tab, which only changes the hash, and see each draft's own tempo.
  await projects.first().click();
  await expect(getMidiNote(track, { beat: 1, pitch: "E4" })).toBeVisible();
  await tempo.fill("140");
  await tempo.press("Enter");
  await saveProject(page);
  const secondShareUrl = await copyShareLink(page);
  await page.goto(shareUrl);
  await expect(page.getByTestId("draft-badge")).toBeVisible();
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

  // Open the draft route with no payload at all, and get sent home.
  await page.goto("/draft");
  await expect(
    page.getByText("This share link has no project in it."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to projects" }).click();
  await expect(projects).toHaveCount(2);
});

async function copyShareLink(page: Page) {
  await selectMenuItem(page, { menu: "Editor menu", item: "Copy Share Link" });
  await expect(page.getByText("Share link copied")).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}
