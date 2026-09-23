import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  openRecorderMidiInstrument,
} from "./recorder-helpers";

test("updates tab strings for selected MIDI notes together", async ({
  page,
}) => {
  // Create two notes and enable five-string bass annotations.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const c4 = await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  const e4 = await createRecorderMidiNote(page, row, {
    beat: 0.5,
    pitch: "E4",
  });

  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await instrument
    .getByRole("checkbox", { name: "Show string annotations" })
    .check();
  await instrument
    .getByRole("combobox", { name: "Tuning", exact: true })
    .selectOption({ label: "5-string bass (BEADG)" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");

  // Select both notes and assign them to the fifth string together.
  await c4.click({ modifiers: ["Control"] });
  await e4.click({ modifiers: ["Control"] });
  await page.keyboard.press("5");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("B37");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("B41");

  // Move both annotations to the adjacent string.
  await page.keyboard.press("ArrowUp");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("E32");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("E36");

  // Reset both annotations to their automatic strings.
  await page.keyboard.press("0");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");

  // Save and reload the project to preserve the reset annotations.
  await saveRecorderProject(page);
  await page.reload();
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");
});
