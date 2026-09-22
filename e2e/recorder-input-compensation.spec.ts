import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject } from "./recorder-helpers";

useFakeAudioInput();

test("retain compensation for the automatically selected input", async ({
  page,
}) => {
  // Open input setup and require active input before accepting compensation.
  await createRecorderProject(page);
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  const compensation = setup.getByRole("textbox");
  await expect(compensation).toBeDisabled();

  // Enable the automatically selected device and save 50 ms of compensation.
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(compensation).toBeEnabled();
  await compensation.fill("50");
  await compensation.press("Enter");

  // Restart input and retain the saved value without manually selecting a device.
  await setup
    .getByRole("button", { name: "Disable input", exact: true })
    .click();
  await expect(compensation).toBeDisabled();
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(compensation).toBeEnabled();
  await expect(compensation).toHaveValue("50");
});
