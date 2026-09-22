import { expect, test } from "@playwright/test";
import { createCheckpoint, useFakeAudioInput } from "./helpers";
import { createRecorderProject } from "./recorder-helpers";

useFakeAudioInput();

test("reject weak latency measurements without changing compensation", async ({
  page,
}) => {
  // Enable input and set compensation before measuring the fake microphone signal.
  await createRecorderProject(page);
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  const compensation = setup.getByRole("textbox");
  await expect(compensation).toBeEnabled();
  await compensation.fill("50");
  await compensation.press("Enter");

  // Start measurement and disable input changes while the clicks play.
  await setup.getByText("How do I set this?", { exact: true }).click();
  const checkpoint = createCheckpoint();
  await setup
    .getByRole("button", { name: "Measure latency", exact: true })
    .click();
  await expect(
    setup.getByRole("button", { name: "Measuring…" }),
  ).toBeDisabled();
  await expect(compensation).toBeDisabled();
  await expect(
    setup.getByRole("combobox", { name: "Device", exact: true }),
  ).toBeDisabled();
  await expect(
    setup.getByRole("button", { name: "Disable input", exact: true }),
  ).toBeDisabled();

  // Reject the fake audio's weak correlation and restore controls without replacing compensation.
  const error = setup.getByRole("alert");
  // Measured at 5.4 seconds locally, including playback and analysis.
  await expect(error).toContainText(
    "Could not detect the loopback clicks reliably.",
    { timeout: 10_000 },
  );
  checkpoint("Latency measurement rejected");
  await expect(compensation).toBeEnabled();
  await expect(compensation).toHaveValue("50");
  await expect(
    setup.getByRole("button", { name: "Measure latency", exact: true }),
  ).toBeEnabled();
  await expect(
    setup.getByRole("combobox", { name: "Device", exact: true }),
  ).toBeEnabled();
  await expect(
    setup.getByRole("button", { name: "Disable input", exact: true }),
  ).toBeEnabled();

  // Close input setup and leave the project marked saved.
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(save).toHaveAttribute("data-status", "saved");
});
