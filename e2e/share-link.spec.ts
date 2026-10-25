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
  // Create a project with a backing track, a reference video, a note, and its
  // own tempo, and save it.
  await createProject(page);
  const projectUrl = page.url();
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  await expect(page.getByTestId("clip-audio")).toHaveCount(1);
  await page.getByTestId("reference-video-button").click();
  const referencePanel = page.getByTestId("youtube-reference");
  await referencePanel
    .getByTestId("youtube-input")
    .fill("https://www.youtube.com/watch?v=knp40WxQgOI");
  await referencePanel.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByTestId("reference-track")).toBeVisible();
  const track = page.getByTestId("midi-track-row");
  await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });
  const tempo = page.getByTestId("tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await saveProject(page);

  // Copy a share link from the editor menu.
  const shareUrl = await copyShareLink(page);

  // Open the link, and see the project's MIDI and reference video as a draft
  // with no save button, and without the audio, which a link does not carry.
  await page.goto(shareUrl);
  await expect(page.getByTestId("draft-badge")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveText("Untitled");
  await expect(getMidiNote(track, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(tempo).toHaveValue("90");
  await expect(page.getByTestId("save-button")).toHaveCount(0);
  await expect(page.getByTestId("audio-track-row")).toHaveCount(0);
  await expect(page.getByTestId("reference-track")).toBeVisible();

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
});

test("shares a project an agent builds in the open app as a project file", async ({
  page,
  context,
  baseURL,
}) => {
  // Build a project through the eval tool, as an agent in a browser without
  // WebMCP does through the page's polyfill, and take it out in the share
  // format.
  await createProject(page);
  const shared = await page.evaluate(async () => {
    const modelContext = document.modelContext!;
    const tools = await modelContext.getTools();
    const evalTool = tools.find((tool) => tool.name === "toy_midi_eval")!;
    const result = await modelContext.executeTool(evalTool, {
      code: `
        runtime.setTempo(98);
        const id = await runtime.addMidiTrack({ program: 0 });
        runtime.setMidiTrackNotes(id, [
          { id: crypto.randomUUID(), pitch: 60, start: 0, duration: 1, velocity: 100 },
        ]);
        return utils.createSharedProject(runtime.serializeProject());
      `,
    });
    return JSON.parse(result);
  });
  expect(shared.isError).toBe(false);

  // Serve it as a project file, open it in another tab, and see the agent's
  // tempo and note in an unsaved draft.
  const fileUrl = new URL("/agent-project.json", baseURL).href;
  await context.route(fileUrl, (route) =>
    route.fulfill({ json: shared.value }),
  );
  const draft = await context.newPage();
  await draft.goto(`/draft?src=${encodeURIComponent(fileUrl)}`);
  await expect(draft.getByTestId("draft-badge")).toBeVisible();
  await expect(draft.getByTestId("tempo-input")).toHaveValue("98");
  await expect(
    getMidiNote(draft.getByTestId("midi-track-row"), { beat: 0, pitch: "C4" }),
  ).toBeVisible();
});

async function copyShareLink(page: Page) {
  await selectMenuItem(page, { menu: "Editor menu", item: "Copy Share Link" });
  await expect(page.getByText("Share link copied")).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain("/draft#p=");
  return url;
}
