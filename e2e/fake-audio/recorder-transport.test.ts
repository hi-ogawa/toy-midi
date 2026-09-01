import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("snaps recorder timeline seeking to the selected grid", async ({
  page,
}) => {
  await createRecorderProject(page);

  const pixelsPerBeat = 80;
  const position = page.getByTestId("recorder-position");

  // The default 1/16 grid has four subdivisions per beat, so 0.9 beats snaps
  // to beat 1 rather than the adjacent 0.75-beat grid point.
  await seekRecorderByPixels(page, pixelsPerBeat * 0.9);
  await expect(position).toHaveText("01|02 - 00:00.500");

  // On the 1/4 grid, 0.4 beats rounds back to beat 0 rather than seeking to
  // the raw pointer position.
  await page.getByRole("button", { name: "1/16" }).click();
  await page.getByRole("menuitemradio", { name: "1/4" }).click();
  await seekRecorderByPixels(page, pixelsPerBeat * 0.4);
  await expect(position).toHaveText("01|01 - 00:00.000");
});
