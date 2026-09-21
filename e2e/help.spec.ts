import { expect, test } from "@playwright/test";
import { createProject } from "./editor-helpers";

test("opens and dismisses Help while keeping editor shortcuts inactive", async ({
  page,
}) => {
  // Open the editor reference from More and inspect its shortcut content.
  await createProject(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Help & Shortcuts" }).click();
  const heading = page.getByRole("heading", { name: "Editor quick reference" });
  await expect(heading).toBeVisible();
  await expect(
    page.getByText("Toggle metronome", { exact: true }),
  ).toBeVisible();

  // Suppress the metronome shortcut while Help is open, then dismiss with Escape.
  const metronome = page.getByTitle("Toggle metronome (M)", { exact: true });
  await page.keyboard.press("m");
  await expect(metronome).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(heading).toHaveCount(0);

  // Reopen Help and dismiss it through the visible close control.
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Help & Shortcuts" }).click();
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(heading).toHaveCount(0);
});
