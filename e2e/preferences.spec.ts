import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  enableInput,
  openInputSetup,
  openMidiInstrument,
  saveProject,
  selectMidiInstrument,
} from "./editor-helpers";
import { useFakeAudioInput } from "./helpers";

useFakeAudioInput();

test("keeps auto-scroll and the Audio Input panel per project, and the input device across projects", async ({
  page,
}) => {
  // Enable the default input, disable auto-scroll, and choose a different
  // input device, which leaves the Audio Input panel open.
  await createProject(page);
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
  await createProject(page);
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
  await createProject(page);
  const firstUrl = page.url();
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await saveProject(page);

  // Create a track in another project with bass, then select violin as the new default.
  await createProject(page);
  await addMidiTrack(page);
  await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await selectMidiInstrument(instrument, {
    option: "40: Violin",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await saveProject(page);

  // Reload the bass project and preserve its saved instrument.
  await page.goto(firstUrl);
  await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Add a track with the persisted violin preference despite loading the bass track.
  await addMidiTrack(page);
  const newInstrument = await openMidiInstrument(page, {
    name: "MIDI 2",
  });
  await expect(newInstrument.getByTestId("instrument-select")).toContainText(
    "40: Violin",
  );
});
