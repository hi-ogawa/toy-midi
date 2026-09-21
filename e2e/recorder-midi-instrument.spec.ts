import { expect, type Page, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  getRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

const { Midi } = midiPackage;

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

test("MIDI import preserves the destination instrument and remembered default", async ({
  page,
}) => {
  // Select bass for the destination and prepare a MIDI file carrying a different instrument.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 1" });
  await selectInstrument({
    page,
    name: "MIDI 1",
    option: "33: Electric Bass (finger)",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const source = new Midi();
  const track = source.addTrack();
  track.instrument.number = 40;
  track.addNote({
    midi: 60,
    ticks: 0,
    durationTicks: source.header.ppq,
    velocity: 0.8,
  });

  // Import notes while retaining the destination's bass instrument.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("menuitem", { name: "Import MIDI…", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await (
    await chooser
  ).setFiles({
    name: "violin.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(source.toArray()),
  });
  await expect(
    getRecorderMidiNote(row, { beat: 0, pitch: "C4" }),
  ).toBeVisible();
  await openInstrument({ page, name: "MIDI 1" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 1 program" }),
  ).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Add another track and keep bass as the default after import.
  await addRecorderMidiTrack(page);
  await openInstrument({ page, name: "MIDI 2" });
  await expect(
    page.getByRole("combobox", { name: "MIDI 2 program" }),
  ).toContainText("33: Electric Bass (finger)");
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
