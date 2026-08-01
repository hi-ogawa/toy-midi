import path from "node:path";
import { expect, test } from "@playwright/test";

test("renders and plays a Toy MIDI MusicXML export", async ({ page }) => {
  await page.goto("/score-viewer");
  await page
    .getByLabel("Open MusicXML")
    .setInputFiles(
      path.resolve("src/lib/__snapshots__/five-string-tab.musicxml"),
    );

  await expect(page.getByText("five-string-tab.musicxml")).toBeVisible();
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});
