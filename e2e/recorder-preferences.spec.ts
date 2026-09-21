import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  enableInput,
  getRecorderPosition,
} from "./recorder-helpers";

useFakeAudioInput();

test("input edits preserve newer timeline preferences across projects", async ({
  page,
}) => {
  // Enable the default input before changing the timeline preference.
  await createRecorderProject(page);
  await enableInput(page);

  // Disable auto-scroll, then choose a different input device.
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await page.getByLabel("Device").selectOption({ label: "Fake Audio Input 1" });
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

test("auto-scroll follows playback only while enabled and remembers its shortcut change", async ({
  page,
}) => {
  // Disable following and seek beyond the initial viewport while playback runs.
  await createRecorderProject(page);
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await page.keyboard.press("f");
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const initial = await ruler.textContent();
  await page.getByTestId("recorder-play-button").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(10);
  await expect(ruler).toHaveText(initial!);

  // Enable following and bring the playing position into view.
  await page.keyboard.press("f");
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await expect(ruler).not.toHaveText(initial!);
  await page.getByTestId("recorder-play-button").click();

  // Reload and create another project with the shortcut's latest preference retained.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await createRecorderProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
});
