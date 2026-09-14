import { expect, test } from "@playwright/test";

test("holds the tuner reading through brief input gaps", async ({ page }) => {
  // Open a stable E1 reading and pause time to control the display holds.
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto("/_preview?component=recorder-tuner");
  const content = page.getByTestId("tuner-content");
  const cursor = content.getByTestId("tuner-cursor");
  await expect(content.getByText("E1", { exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));

  // Keep the note and cursor steady through a brief unstable result.
  await page.getByRole("button", { name: "Unstable", exact: true }).click();
  await page.clock.runFor(200);
  await expect(content.getByText("In tune", { exact: true })).toBeVisible();
  await expect(cursor).toBeVisible();
  await expect(content.getByText("Finding pitch...")).toHaveCount(0);

  // Recover immediately and cancel the pending dimming timer.
  await page.getByRole("button", { name: "Sharp", exact: true }).click();
  await expect(content.getByText("+25 cents", { exact: true })).toBeVisible();
  await page.clock.runFor(100);
  await expect(content).toHaveAttribute("data-dimmed", "false");
  await expect(cursor).toBeVisible();

  // Dim a held note and hide its cursor when instability persists.
  await page.getByRole("button", { name: "Unstable", exact: true }).click();
  await page.clock.runFor(250);
  await expect(content).toHaveAttribute("data-dimmed", "true");
  await expect(content.getByText("E1", { exact: true })).toBeVisible();
  await expect(cursor).toBeHidden();

  // Restore a fresh pitch, hold through a short silence, then clear the note.
  await page.getByRole("button", { name: "In tune", exact: true }).click();
  await expect(content).toHaveAttribute("data-dimmed", "false");
  await expect(cursor).toBeVisible();
  await page.getByRole("button", { name: "No signal", exact: true }).click();
  await page.clock.runFor(350);
  await expect(content.getByText("E1", { exact: true })).toBeVisible();
  await page.clock.runFor(50);
  await expect(content.getByText("E1", { exact: true })).toHaveCount(0);
  await expect(content.getByText("No signal", { exact: true })).toBeVisible();
  await expect(content.getByText("Play a note", { exact: true })).toHaveCount(
    0,
  );
  await expect(cursor).toBeHidden();
});
