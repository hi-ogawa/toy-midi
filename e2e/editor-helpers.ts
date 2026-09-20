import { expect, type Locator, type Page, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";

/** Create a recorder project from its index and wait for the recorder app. */
export async function createProject(page: Page): Promise<void> {
  await test.step(
    "Create recorder project",
    async () => {
      await page.goto("/");
      await page.getByTestId("new-recorder-project-button").click();
      await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
      await expect(page.getByTestId("recorder-project-name")).toBeVisible();
    },
    { box: true },
  );
}

export async function addMidiTrack(page: Page) {
  return await test.step(
    "Add recorder MIDI track",
    async () => {
      const tracks = page.getByTestId("recorder-midi-track-row");
      const count = await tracks.count();
      await page.getByTestId("recorder-add-midi-track").click();
      await expect(tracks).toHaveCount(count + 1);
      const track = tracks.nth(count);
      await expect(track.getByTestId("recorder-midi-grid")).toBeVisible();
      return track;
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
    .getByTestId("recorder-midi-grid")
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
  const gridBox = (await track
    .getByTestId("recorder-midi-grid")
    .boundingBox())!;
  const keyBox = (await key.boundingBox())!;
  return {
    x: gridBox.x + beat * DEFAULT_PIXELS_PER_BEAT,
    y: keyBox.y + keyBox.height / 2,
  };
}

export async function saveProject(page: Page) {
  await test.step(
    "Save recorder project",
    async () => {
      const save = page.getByTestId("recorder-save-button");
      await save.click();
      await expect(save).toHaveAttribute("data-status", "saved");
    },
    { box: true },
  );
}

export async function addAudio(page: Page, filePath: string): Promise<void> {
  await test.step(
    "Add recorder audio",
    async () => {
      const clips = page.getByTestId("recorder-clip-audio");
      const count = await clips.count();
      const fileChooser = page.waitForEvent("filechooser");
      await page.getByTestId("recorder-add-audio-file").click();
      await (await fileChooser).setFiles(filePath);
      await expect(clips).toHaveCount(count + 1);
      await expect(clips.nth(count).locator("svg")).toBeVisible();
    },
    { box: true },
  );
}

export async function seekByPixels(page: Page, pixels: number) {
  await test.step(
    `Seek recorder to ${pixels}px`,
    async () => {
      const ruler = page.getByTestId("recorder-timeline-ruler");
      const box = await ruler.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
    },
    { box: true },
  );
}

export async function getPosition(page: Page): Promise<number> {
  return page
    .getByTestId("recorder-position")
    .evaluate((element) => Number(element.dataset.position));
}

export async function getBeat(page: Page): Promise<number> {
  return page
    .getByTestId("recorder-position")
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
  const initialWidth = await recording.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);
}

export async function enableInput(page: Page) {
  await test.step(
    "Enable audio input",
    async () => {
      // Fake audio still exercises permission, device discovery, and channel setup.
      const inputSetupButton = page.getByRole("button", {
        name: "Configure audio input",
      });
      await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await inputSetupButton.click();
      await expect(
        page.getByRole("heading", { name: "Audio Input Setup" }),
      ).toBeVisible();
      const setup = page.getByTestId("recorder-input-setup");
      await setup.getByRole("button", { name: "Enable input" }).click();
      await expect(
        setup.getByRole("button", { name: "Disable input" }),
      ).toBeVisible();
      await expect(page.getByLabel("Device")).toContainText(
        "Fake Default Audio Input",
      );
      await expect(page.getByLabel("Channel")).toContainText("Channel 1");
      await setup.getByRole("button", { name: "Close", exact: true }).click();
      await expect(
        page.getByText("Fake Default Audio Input · Channel 1"),
      ).toBeVisible();
      await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
    { box: true },
  );
}
