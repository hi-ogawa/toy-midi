import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

test("quantizes selected notes to the current grid and can undo", async ({
  page,
}) => {
  await page.goto("/");
  await clickNewProject(page);

  await evaluateStore(page, (store) => {
    store.setState({
      gridSnap: "1/8",
      notes: [
        { id: "n1", pitch: 60, start: 0.3, duration: 0.2, velocity: 100 },
        { id: "n2", pitch: 64, start: 1.2, duration: 0.8, velocity: 100 },
      ],
      selectedNoteIds: new Set(["n1", "n2"]),
    });
  });

  await page.keyboard.press("q");

  expect(
    await evaluateStore(page, (store) =>
      store
        .getState()
        .notes.map(({ start, duration }) => ({ start, duration })),
    ),
  ).toEqual([
    { start: 0.5, duration: 0.5 },
    { start: 1, duration: 1 },
  ]);

  await page.keyboard.press("Control+z");

  expect(
    await evaluateStore(page, (store) =>
      store
        .getState()
        .notes.map(({ start, duration }) => ({ start, duration })),
    ),
  ).toEqual([
    { start: 0.3, duration: 0.2 },
    { start: 1.2, duration: 0.8 },
  ]);
});
