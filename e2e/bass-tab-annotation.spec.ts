import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  evaluateFlushAutoSave,
  evaluateStore,
  waitForEditor,
} from "./helpers";

test("edits bass tab annotations and persists manual strings", async ({
  page,
}) => {
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

  const annotations = page.getByTestId("bass-tab-annotation");
  await expect(annotations).toHaveCount(0);

  const toggle = page.getByTestId("bass-tab-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(annotations).toHaveText(["G5", "D4"]);

  const stringCountSelect = page.getByTestId("bass-string-count-select");
  await stringCountSelect.click();
  await page.getByRole("menuitemradio", { name: "5-string" }).click();
  await expect(stringCountSelect).toContainText("5-string");
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  await page.keyboard.press("3");
  await expect(annotations).toHaveText(["A15", "A9"]);

  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["E20", "E14"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25", "B19"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["B25", "B19"]);

  await stringCountSelect.click();
  await page.getByRole("menuitemradio", { name: "4-string" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expect(annotations).toHaveText(["G5", "D4"]);
  await page.keyboard.press("ArrowDown");
  await expect(annotations).toHaveText(["D10", "A9"]);

  await page.keyboard.press("0");
  await expect(annotations).toHaveText(["G5", "D4"]);
  await page.keyboard.press("Control+z");
  await expect(annotations).toHaveText(["D10", "A9"]);
  await page.keyboard.press("Control+Shift+z");
  await expect(annotations).toHaveText(["G5", "D4"]);

  await stringCountSelect.click();
  await page.getByRole("menuitemradio", { name: "5-string" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("5");
  await expect(annotations).toHaveText(["B25", "B19"]);

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const copiedStrings = await evaluateStore(page, (store) =>
    store.getState().notes.map((note) => note.bassString),
  );
  expect(copiedStrings).toEqual([5, 5, 5, 5]);

  await evaluateFlushAutoSave(page);
  await page.reload();
  await waitForEditor(page);

  await expect(page.getByTestId("bass-tab-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("bass-string-count-select")).toContainText(
    "5-string",
  );
  await expect(page.getByTestId("bass-tab-annotation")).toHaveText([
    "B25",
    "B19",
    "B25",
    "B19",
  ]);
});
