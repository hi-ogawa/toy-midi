import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

for (const kind of ["loop", "punch"] as const) {
  test(`${kind} menu creates, replaces, and clears its range`, async ({
    page,
  }) => {
    await createRecorderProject(page);
    const label = kind === "loop" ? "Loop" : "Punch";
    const toggle = page.getByTestId(`recorder-${kind}-toggle`);
    const range = page.getByTestId(`recorder-${kind}-range`);
    const menu = page.getByRole("button", { name: `${label} range actions` });

    await expect(toggle).toHaveAccessibleName(`${label}: no range`);
    await expect(toggle).not.toHaveAttribute("aria-pressed");
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Clear", exact: true }),
    ).toBeDisabled();
    await page.getByRole("menuitem", { name: "New", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(range).toHaveCSS("left", "0px");
    await expect(range).toHaveCSS("width", "320px");
    await expect.poll(() => getRecorderBeat(page)).toBe(0);

    // New replaces the disabled range at the playhead's bar and enables it.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await seekRecorderByPixels(page, 400);
    await expect.poll(() => getRecorderBeat(page)).toBe(5);
    await menu.click();
    await page.getByRole("menuitem", { name: "New", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(range).toHaveCount(1);
    await expect(range).toHaveCSS("left", "320px");
    await expect(range).toHaveCSS("width", "320px");
    await expect.poll(() => getRecorderBeat(page)).toBe(5);

    await menu.click();
    await page.getByRole("menuitem", { name: "Clear", exact: true }).click();
    await expect(range).toHaveCount(0);
    await expect(toggle).toHaveAccessibleName(`${label}: no range`);
    await expect(toggle).not.toHaveAttribute("aria-pressed");
    await expect.poll(() => getRecorderBeat(page)).toBe(5);
  });
}
