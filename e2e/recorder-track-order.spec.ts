import { expect, type Locator, type Page, test } from "@playwright/test";
import { getMenuItem, selectMenuItem } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("reorders tracks from their row menus", async ({ page }) => {
  // Create a project, then add a MIDI track and an empty audio track.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await page.getByRole("button", { name: "Add empty audio track" }).click();
  await expectTrackRows(page, ["Audio 1", "MIDI 1", "Audio 2"]);

  // Check that the first row cannot move up.
  await expect(
    await getMenuItem(page, { menu: "Audio 1 actions", item: "Move up" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  // Check that the last row cannot move down.
  await expect(
    await getMenuItem(page, { menu: "Audio 2 actions", item: "Move down" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  // Move Audio 2 above MIDI 1.
  await selectMenuItem(page, { menu: "Audio 2 actions", item: "Move up" });
  await expectTrackRows(page, ["Audio 1", "Audio 2", "MIDI 1"]);

  // Open the Mixer and verify its channels follow the track order.
  await page.getByTestId("recorder-mixer-button").click();
  await expectMixerChannels(page, [
    "Master",
    "Audio 1",
    "Audio 2",
    "MIDI 1",
    "Metronome",
  ]);

  // Save and reload to restore the order.
  await saveRecorderProject(page);
  await page.reload();
  await expectTrackRows(page, ["Audio 1", "Audio 2", "MIDI 1"]);

  // Remove MIDI 1 after moving it first, then undo to restore it first.
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Move up" });
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Move up" });
  await expectTrackRows(page, ["MIDI 1", "Audio 1", "Audio 2"]);
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Remove track" });
  await expectTrackRows(page, ["Audio 1", "Audio 2"]);
  await page.keyboard.press("ControlOrMeta+Z");
  await expectTrackRows(page, ["MIDI 1", "Audio 1", "Audio 2"]);
});

async function expectTrackRows(page: Page, labels: string[]): Promise<void> {
  await test.step(
    `Expect track rows: ${labels.join(", ")}`,
    async () => {
      const menus = page
        .getByTestId("recorder-track-scroll")
        .getByRole("button", { name: / actions$/ });
      await expect
        .poll(() => getAriaLabels(menus))
        .toEqual(labels.map((label) => `${label} actions`));
    },
    { box: true },
  );
}

async function expectMixerChannels(
  page: Page,
  labels: string[],
): Promise<void> {
  await test.step(
    `Expect mixer channels: ${labels.join(", ")}`,
    async () => {
      const sliders = page
        .getByTestId("recorder-mixer-panel")
        .getByRole("slider");
      await expect
        .poll(() => getAriaLabels(sliders))
        .toEqual(labels.map((label) => `${label} gain`));
    },
    { box: true },
  );
}

function getAriaLabels(locator: Locator): Promise<(string | null)[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
}
