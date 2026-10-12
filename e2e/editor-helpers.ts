import { expect, type Locator, type Page, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";

/** Create a project from its index, save the draft, and wait for the stored project's editor. */
export async function createProject(page: Page): Promise<void> {
  await test.step(
    "Create project",
    async () => {
      await page.goto("/");
      await page.getByTestId("new-project-button").click();
      await page.getByTestId("save-draft-button").click();
      await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
      await expect(page.getByTestId("project-name")).toBeVisible();
    },
    { box: true },
  );
}

export async function addMidiTrack(page: Page) {
  return await test.step(
    "Add MIDI track",
    async () => {
      const tracks = page.getByTestId("midi-track-row");
      const count = await tracks.count();
      await page.getByTestId("add-midi-track").click();
      await expect(tracks).toHaveCount(count + 1);
      const track = tracks.nth(count);
      await expect(track.getByTestId("midi-grid")).toBeVisible();
      return track;
    },
    { box: true },
  );
}

export async function openMidiInstrument(
  page: Page,
  { name }: { name: string },
) {
  return await test.step(
    `Open ${name} instrument`,
    async () => {
      await selectMenuItem(page, {
        menu: `${name} actions`,
        item: "Instrument…",
      });
      return page.getByTestId("midi-instrument");
    },
    { box: true },
  );
}

export async function selectMidiInstrument(
  instrument: Locator,
  { option }: { option: string },
) {
  await test.step(
    `Select ${option}`,
    async () => {
      const page = instrument.page();
      const program = instrument.getByTestId("instrument-select");
      await program.click();
      await page
        .getByPlaceholder("Search instruments...")
        .fill(option.split(": ")[1]);
      await page.getByRole("option", { name: option, exact: true }).click();
      await expect(program).toContainText(option);
      await expect(program).toBeEnabled();
    },
    { box: true },
  );
}

export async function createMidiNote(
  page: Page,
  track: Locator,
  {
    beat,
    pitch,
  }: {
    /** Zero-based beat at a grid boundary. */
    beat: number;
    pitch: string;
  },
) {
  return await test.step(
    `Create ${pitch} at beat ${beat}`,
    async () => {
      const point = await getMidiGridPoint(track, { beat, pitch });
      // Click inside the cell rather than directly on its boundary.
      await page.mouse.click(point.x + 5, point.y);
      const note = getMidiNote(track, { beat, pitch });
      await expect(note).toBeVisible();
      return note;
    },
    { box: true },
  );
}

/** Locate a note by pitch and zero-based beat, using its displayed one-based label. */
export function getMidiNote(
  track: Locator,
  {
    beat,
    pitch,
  }: {
    beat: number;
    pitch: string;
  },
) {
  return track
    .getByTestId("midi-grid")
    .locator(`[data-note-id][aria-label="${pitch}, beat ${beat + 1}"]`);
}

/** Convert a zero-based beat and pitch to a point at the default zoom and horizontal origin. */
export async function getMidiGridPoint(
  track: Locator,
  {
    beat,
    pitch,
  }: {
    beat: number;
    pitch: string;
  },
) {
  const key = track.getByRole("button", {
    name: `Preview ${pitch}`,
    exact: true,
  });
  await expect(key).toBeVisible();
  const gridBox = (await track.getByTestId("midi-grid").boundingBox())!;
  const keyBox = (await key.boundingBox())!;
  return {
    x: gridBox.x + beat * DEFAULT_PIXELS_PER_BEAT,
    y: keyBox.y + keyBox.height / 2,
  };
}

export async function saveProject(page: Page) {
  await test.step(
    "Save project",
    async () => {
      const save = page.getByTestId("save-button");
      await save.click();
      await expect(save).toHaveAttribute("data-status", "saved");
    },
    { box: true },
  );
}

export async function addAudio(page: Page, filePath: string): Promise<void> {
  await test.step(
    "Add audio",
    async () => {
      const clips = page.getByTestId("clip-audio");
      const count = await clips.count();
      const fileChooser = page.waitForEvent("filechooser");
      await page.getByTestId("add-audio-file").click();
      await (await fileChooser).setFiles(filePath);
      await expect(clips).toHaveCount(count + 1);
      await expect(clips.nth(count).locator("svg")).toBeVisible();
    },
    { box: true },
  );
}

export async function seekByPixels(page: Page, pixels: number) {
  await test.step(
    `Seek to ${pixels}px`,
    async () => {
      const ruler = page.getByTestId("timeline-ruler");
      const box = await ruler.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
    },
    { box: true },
  );
}

export async function scrollTimelineByPixels(page: Page, pixels: number) {
  await test.step(
    `Scroll timeline by ${pixels}px`,
    async () => {
      const ruler = page.getByTestId("timeline-ruler");
      const box = await ruler.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(0, pixels);
    },
    { box: true },
  );
}

export async function getPosition(page: Page): Promise<number> {
  return page
    .getByTestId("position")
    .evaluate((element) => Number(element.dataset.position));
}

export async function getBeat(page: Page): Promise<number> {
  return page
    .getByTestId("position")
    .evaluate((element) => Number(element.dataset.beat));
}

export async function dragBy(
  page: Page,
  locator: Locator,
  deltaX: number,
  {
    deltaY = 0,
    anchorXOffset,
    release = true,
  }: { deltaY?: number; anchorXOffset?: number; release?: boolean } = {},
) {
  return await test.step(
    `Drag by ${deltaX}px, ${deltaY}px${release ? "" : " without releasing"}`,
    async () => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      const startX = box!.x + (anchorXOffset ?? box!.width / 2);
      const startY = box!.y + box!.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
      if (release) {
        await page.mouse.up();
      }
      return { x: startX, y: startY };
    },
    { box: true },
  );
}

export async function waitForRecordingSamples(recording: Locator) {
  await test.step(
    "Wait for recording samples",
    async () => {
      const initialWidth = await recording.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
      await expect
        .poll(() =>
          recording.evaluate(
            (element) => element.getBoundingClientRect().width,
          ),
        )
        .toBeGreaterThan(initialWidth);
    },
    { box: true },
  );
}

/** Open the Audio Input panel from the header unless it is already open. */
export async function openInputPanel(page: Page): Promise<Locator> {
  return await test.step(
    "Open audio input panel",
    async () => {
      const button = page.getByTestId("input-panel-button");
      if ((await button.getAttribute("aria-pressed")) !== "true") {
        await button.click();
      }
      const panel = page.getByTestId("input-panel");
      await expect(panel).toBeVisible();
      return panel;
    },
    { box: true },
  );
}

/** Open Audio Input Setup from the input panel's route field. */
export async function openInputSetup(page: Page): Promise<Locator> {
  return await test.step(
    "Open audio input setup",
    async () => {
      const panel = await openInputPanel(page);
      await panel.getByTitle("Audio input setup").click();
      await expect(
        page.getByRole("heading", { name: "Audio Input Setup" }),
      ).toBeVisible();
      return page.getByTestId("input-setup");
    },
    { box: true },
  );
}

export async function enableInput(page: Page) {
  await test.step(
    "Enable audio input",
    async () => {
      // Fake audio still exercises permission, device discovery, and channel setup.
      const panel = await openInputPanel(page);
      await expect(panel.getByTitle("Audio input setup")).toContainText(
        "Fake Default Audio Input · Channel 1",
      );
      const inputPower = panel.getByRole("button", { name: "Input power" });
      await expect(inputPower).toHaveAttribute("aria-pressed", "false");
      await inputPower.click();
      await expect(inputPower).toHaveAttribute("aria-pressed", "true");
      await panel
        .getByRole("button", { name: "Close Audio Input", exact: true })
        .click();
    },
    { box: true },
  );
}

export async function armTrack(page: Page, { track }: { track: string }) {
  await test.step(
    `Arm ${track}`,
    async () => {
      const arm = page.getByRole("button", {
        name: `Arm ${track} for recording`,
        exact: true,
      });
      await arm.click();
      await expect(
        page.getByRole("button", {
          name: `Disarm ${track} for recording`,
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    },
    { box: true },
  );
}
