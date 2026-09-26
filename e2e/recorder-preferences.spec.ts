import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  enableInput,
  openInputPanel,
  openInputSetup,
  openRecorderMidiInstrument,
  saveRecorderProject,
  selectRecorderMidiInstrument,
} from "./recorder-helpers";

useFakeAudioInput();

test("input edits preserve newer timeline preferences across projects", async ({
  page,
}) => {
  // Enable the default input before changing the timeline preference.
  await createRecorderProject(page);
  await enableInput(page);

  // Disable auto-scroll, then choose a different input device.
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await openInputSetup(page);
  await page.getByLabel("Device").selectOption({ label: "Fake Audio Input 1" });
  await page
    .getByTestId("recorder-input-setup")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // Reload to verify the persisted preference, then carry it into another project.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await createRecorderProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
});

test("remembers the Audio Input panel across reloads and projects", async ({
  page,
}) => {
  // Open the Audio Input panel.
  await createRecorderProject(page);
  const panel = await openInputPanel(page);

  // Reload and open another project with the panel still open.
  await page.reload();
  await expect(panel).toBeVisible();
  await createRecorderProject(page);
  await expect(panel).toBeVisible();

  // Close the panel and keep it closed after a reload.
  await panel
    .getByRole("button", { name: "Close Audio Input", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
  await expect(panel).toBeHidden();
});

test("remembers the instrument preference without changing saved tracks", async ({
  page,
}) => {
  // Save a project with a bass track.
  await createRecorderProject(page);
  const firstUrl = page.url();
  await addRecorderMidiTrack(page);
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await selectRecorderMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Create a track in another project with bass, then select violin as the new default.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await selectRecorderMidiInstrument(instrument, {
    option: "40: Violin",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Reload the bass project and preserve its saved instrument.
  await page.goto(firstUrl);
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Add a track with the persisted violin preference despite loading the bass track.
  await addRecorderMidiTrack(page);
  const newInstrument = await openRecorderMidiInstrument(page, {
    name: "MIDI 2",
  });
  await expect(newInstrument.getByTestId("instrument-select")).toContainText(
    "40: Violin",
  );
});
