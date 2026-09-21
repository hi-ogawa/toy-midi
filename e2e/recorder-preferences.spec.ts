import { expect, type Page, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  enableInput,
  saveRecorderProject,
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
  await page.getByRole("button", { name: "Configure audio input" }).click();
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

test("remembers the instrument preference without changing saved tracks", async ({
  page,
}) => {
  // Save a project with a bass track.
  await createRecorderProject(page);
  const firstUrl = page.url();
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 1" });
  await selectInstrument({
    page,
    name: "MIDI 1",
    option: "33: Electric Bass (finger)",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Create a track in another project with bass, then select violin as the new default.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await selectInstrument({ page, name: "MIDI 1", option: "40: Violin" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Reload the bass project and preserve its saved instrument.
  await page.goto(firstUrl);
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Add a track with the persisted violin preference despite loading the bass track.
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 2" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 2 program" }),
  ).toContainText("40: Violin");
});

async function openInstrument({ page, name }: { page: Page; name: string }) {
  await test.step(
    `Open ${name} instrument`,
    async () => {
      await page
        .getByRole("button", { name: `${name} actions`, exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Instrument…", exact: true })
        .click();
    },
    { box: true },
  );
}

async function selectInstrument({
  page,
  name,
  option,
}: {
  page: Page;
  name: string;
  option: string;
}) {
  await test.step(
    `Select ${option} for ${name}`,
    async () => {
      const program = page.getByRole("combobox", { name: `${name} program` });
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
