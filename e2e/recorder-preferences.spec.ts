import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject, enableInput } from "./recorder-helpers";

useFakeAudioInput();

test("input edits preserve newer timeline preferences across projects", async ({
  page,
}) => {
  // Open input setup so its remembered settings exist before changing the timeline.
  await createRecorderProject(page);
  await enableInput(page);

  // Disable auto-scroll, then edit the input channel without reverting that preference.
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await page.getByLabel("Channel").selectOption("0");
  await page
    .getByTestId("recorder-input-setup")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // Reload to verify the persisted preference, then carry it into another project.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await createRecorderProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
});
