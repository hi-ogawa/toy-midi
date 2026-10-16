import { expect, test } from "@playwright/test";
import { createProject, enableInput, openInputSetup } from "./editor-helpers";
import { useFakeAudioInput } from "./helpers";

useFakeAudioInput();

test("keeps auto-scroll and the Audio Input panel per project, and the input device across projects", async ({
  page,
}) => {
  // Enable the default input, disable auto-scroll, and choose a different
  // input device, which leaves the Audio Input panel open.
  await createProject(page);
  const firstUrl = page.url();
  await enableInput(page);
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  const setup = await openInputSetup(page);
  await setup
    .getByLabel("Device")
    .selectOption({ label: "Fake Audio Input 1" });
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  const panel = page.getByTestId("input-panel");
  await expect(panel).toBeVisible();

  // Reload, and confirm the project keeps auto-scroll disabled and the panel
  // open.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toBeVisible();

  // Open another project, and confirm it starts with auto-scroll enabled and
  // the panel closed, while the input device carries over.
  await createProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toBeHidden();
  const nextSetup = await openInputSetup(page);
  await expect(
    nextSetup.getByLabel("Device").locator("option:checked"),
  ).toHaveText("Fake Audio Input 1");

  // Return to the first project, and confirm it still has its own settings.
  await page.goto(firstUrl);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toBeVisible();
});
