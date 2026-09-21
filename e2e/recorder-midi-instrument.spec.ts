import { expect, type Page, test } from "@playwright/test";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("remembers selected instruments for new tracks without changing saved tracks", async ({
  page,
}) => {
  // Start with piano, then select bass and save the first project.
  await createRecorderProject(page);
  const firstUrl = page.url();
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("0: Acoustic Grand Piano");
  await selectInstrument({
    page,
    name: "MIDI 1",
    option: "33: Electric Bass (finger)",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Add another track in the same project with the remembered bass instrument.
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 2" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 2 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Carry bass into a new project, then explicitly choose violin as the new default.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await selectInstrument({ page, name: "MIDI 1", option: "40: Violin" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Reload and create a track with violin to verify the default survives a fresh page.
  await page.reload();
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("40: Violin");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 2" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 2 program" }),
  ).toContainText("40: Violin");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Reopen the bass project without overwriting its saved instruments or the violin default.
  await page.goto(firstUrl);
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 3" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 3 program" }),
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
