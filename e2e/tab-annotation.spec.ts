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
        { id: "high", pitch: 48, start: 0, duration: 1, velocity: 100 },
        { id: "low", pitch: 42, start: 2, duration: 1, velocity: 100 },
      ],
      selectedNoteIds: new Set(["high", "low"]),
    });
  });

  const annotations = page.getByTestId("tab-annotation");
  await expect(annotations).toHaveCount(0);

  await page.getByTestId("settings-button").click();
  await page.getByTestId("tab-annotation-toggle").check();
  await page.getByTestId("tab-string-setup-select").selectOption("fiveString");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(annotations).toHaveText(["G5", "D4"]);

  await page.keyboard.press("3");
  await expect(annotations).toHaveText(["A15", "A9"]);

  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["E20", "E14"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25", "B19"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25", "B19"]);

  await page.getByTestId("settings-button").click();
  await page.getByTestId("tab-string-setup-select").selectOption("fourString");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(annotations).toHaveText(["G5", "D4"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["D10", "A9"]);

  await page.keyboard.press("0");
  await expect(annotations).toHaveText(["G5", "D4"]);
  await page.keyboard.press("Control+z");
  await expect(annotations).toHaveText(["D10", "A9"]);
  await page.keyboard.press("Control+Shift+z");
  await expect(annotations).toHaveText(["G5", "D4"]);

  await page.getByTestId("settings-button").click();
  await page.getByTestId("tab-string-setup-select").selectOption("fiveString");
  await page.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("5");
  await expect(annotations).toHaveText(["B25", "B19"]);

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const copiedStrings = await evaluateStore(page, (store) =>
    store.getState().notes.map((note) => note.tabString),
  );
  expect(copiedStrings).toEqual([5, 5, 5, 5]);

  await evaluateFlushAutoSave(page);
  await page.reload();
  await waitForEditor(page);

  expect(
    await evaluateStore(page, (store) => ({
      enabled: store.getState().tabAnnotationEnabled,
      openStringPitches: store.getState().tabOpenStringPitches,
    })),
  ).toEqual({ enabled: true, openStringPitches: [43, 38, 33, 28, 23] });
  await expect(page.getByTestId("tab-annotation")).toHaveText([
    "B25",
    "B19",
    "B25",
    "B19",
  ]);
});
