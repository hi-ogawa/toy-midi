import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject, openInputSetup } from "./recorder-helpers";

useFakeAudioInput();

test("retain input compensation without marking the project unsaved", async ({
  page,
}) => {
  // Open input setup and require active input before accepting compensation.
  await createRecorderProject(page);
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  await openInputSetup(page);
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

  // Close input setup and keep the project saved after changing compensation.
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await openInputSetup(page);

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

  // Reload without saving the project and restore compensation from input preferences.
  await page.reload();
  await expect(save).toHaveAttribute("data-status", "saved");
  await openInputSetup(page);
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(compensation).toBeEnabled();
  await expect(compensation).toHaveValue("50");
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(save).toHaveAttribute("data-status", "saved");
});
