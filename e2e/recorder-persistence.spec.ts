import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("restores the recorder project after reload", async ({ page }) => {
  await page.goto("/recorder");
  const title = page.getByLabel("Recording title");
  await expect(title).toHaveValue("Untitled recording");
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  await title.fill("Practice take");

  const fileInput = page.locator('input[type="file"][accept^="audio/"]');
  await fileInput.setInputFiles({
    name: "backing.wav",
    mimeType: "audio/wav",
    buffer: await fs.readFile(
      path.join(import.meta.dirname, "fixtures", "test-audio.wav"),
    ),
  });
  await expect(page.getByText("backing.wav", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await page.reload();

  await expect(title).toHaveValue("Practice take");
  await expect(page.getByText("backing.wav", { exact: true })).toBeVisible();
});
