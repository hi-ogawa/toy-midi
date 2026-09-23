import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

// Without fake media flags, devices stay unlabeled until access is granted.
test("leads from the input panel access prompt to setup", async ({ page }) => {
  // Open the input panel while microphone access is still required.
  await createRecorderProject(page);
  const panelButton = page.getByTestId("recorder-input-panel-button");
  await expect(panelButton).toHaveAttribute(
    "title",
    "Audio Input (microphone access required)",
  );
  await panelButton.click();
  const panel = page.getByTestId("recorder-input-panel");
  await expect(
    panel.getByRole("button", { name: "Turn input on" }),
  ).toHaveCount(0);

  // Follow the access prompt into setup, where access is granted.
  await panel.getByRole("button", { name: "Allow microphone access…" }).click();
  await expect(
    page
      .getByTestId("recorder-input-setup")
      .getByRole("button", { name: "Allow microphone access", exact: true }),
  ).toBeVisible();
});
