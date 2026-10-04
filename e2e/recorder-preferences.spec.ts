import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  enableInput,
  openInputSetup,
  openRecorderMidiInstrument,
  saveRecorderProject,
  selectRecorderMidiInstrument,
} from "./recorder-helpers";

useFakeAudioInput();

test("keeps auto-scroll and the Audio Input panel per project, and the input device across projects", async ({
  page,
}) => {
  // Enable the default input, disable auto-scroll, and choose a different
  // input device, which leaves the Audio Input panel open.
  await createRecorderProject(page);
  const firstUrl = page.url();
  await enableInput(page);
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  const setup = await openInputSetup(page);
  await setup
    .getByLabel("Device")
    .selectOption({ label: "Fake Audio Input 1" });
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  const panel = page.getByTestId("recorder-input-panel");
  await expect(panel).toBeVisible();

  // Reload, and confirm the project keeps auto-scroll disabled and the panel
  // open.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toBeVisible();

  // Open another project, and confirm it starts with auto-scroll enabled and
  // the panel closed, while the input device carries over.
  await createRecorderProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toBeHidden();
  const nextSetup = await openInputSetup(page);
  await expect(
    nextSetup.getByLabel("Device").locator("option:checked"),
  ).toHaveText("Fake Audio Input 1");

  // Return to the first project, and confirm it still has its own settings.
  await page.goto(firstUrl);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toBeVisible();
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
