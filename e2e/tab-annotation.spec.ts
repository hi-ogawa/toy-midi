import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  evaluateFlushAutoSave,
  evaluateStore,
  waitForEditor,
} from "./helpers";

test("edits tab annotations and persists manual strings", async ({ page }) => {
  await page.goto("/");
  await clickNewProject(page);

  await evaluateStore(page, (store) => {
    store.setState({
      notes: [
        { id: "high", pitch: 48, start: 0, duration: 1, velocity: 100 }, // C3
        // F#1 is below the viewport and verifies assignment through store state.
        { id: "low", pitch: 30, start: 2, duration: 1, velocity: 100 },
      ],
      selectedNoteIds: new Set(["high", "low"]),
    });
  });

  const annotations = page.getByTestId("tab-annotation");
  await expect(annotations).toHaveCount(0);

  // Enable annotations with the five-string bass tuning.
  await page.getByTestId("settings-button").click();
  await page.getByTestId("tab-annotation-toggle").check();
  await page
    .getByTestId("tab-string-preset-select")
    .selectOption("fiveStringBass");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(annotations).toHaveText(["G5"]);
  const highNote = page.getByTestId("note-high");
  const initialColor = await highNote.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  // Absolute assignment updates only notes playable on the requested string.
  await page.keyboard.press("3");
  await expect(annotations).toHaveText(["A15"]);
  expect(
    await evaluateStore(page, (store) =>
      store.getState().notes.map((note) => note.tabString),
    ),
  ).toEqual([3, undefined]);
  await expect
    .poll(() =>
      highNote.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(initialColor);

  // Relative movement stops at the lowest string in the active tuning.
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["E20"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25"]);

  // Switching tuning invalidates manual strings that no longer exist.
  await page.getByTestId("settings-button").click();
  await page
    .getByTestId("tab-string-preset-select")
    .selectOption("fourStringBass");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(annotations).toHaveText(["G5"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["D10"]);

  // Returning to automatic assignment remains undoable and redoable.
  await page.keyboard.press("0");
  await expect(annotations).toHaveText(["G5"]);
  await page.keyboard.press("Control+z");
  await expect(annotations).toHaveText(["D10"]);
  await page.keyboard.press("Control+Shift+z");
  await expect(annotations).toHaveText(["G5"]);

  // Manual assignments survive copy and paste.
  await page.getByTestId("settings-button").click();
  await page
    .getByTestId("tab-string-preset-select")
    .selectOption("fiveStringBass");
  await page.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("5");
  await expect(annotations).toHaveText(["B25"]);

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const copiedStrings = await evaluateStore(page, (store) =>
    store.getState().notes.map((note) => note.tabString),
  );
  expect(copiedStrings).toEqual([5, 5, 5, 5]);

  // Annotation settings and note assignments persist across reload.
  await evaluateFlushAutoSave(page);
  await page.reload();
  await waitForEditor(page);

  expect(
    await evaluateStore(page, (store) => ({
      enabled: store.getState().tabAnnotationEnabled,
      openStringPitches: store.getState().tabOpenStringPitches,
    })),
  ).toEqual({ enabled: true, openStringPitches: [43, 38, 33, 28, 23] });
  await expect(page.getByTestId("tab-annotation")).toHaveText(["B25", "B25"]);
});
