import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  enableAndArmCapture,
  waitForRecordingSamples,
} from "./recorder-helpers";

test("separates input setup, Capture arm, and monitoring", async ({ page }) => {
  // Enable the shared input and explicitly arm Capture before recording.
  await createRecorderProject(page);
  await enableAndArmCapture(page);
  const arm = page.getByTestId("recorder-arm-toggle");
  const record = page.getByTestId("recorder-record-button");
  const monitor = page.getByTestId("recorder-input-monitor");
  const setup = page.getByTestId("recorder-input-setup");
  await monitor.click();
  await expect(monitor).toHaveAttribute("aria-pressed", "true");

  // Disarm Capture and hide monitoring while keeping the shared input open.
  await arm.click();
  await expect(arm).toHaveAttribute("aria-pressed", "false");
  await expect(monitor).toHaveCount(0);
  await expect(record).toBeDisabled();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Audio input…" }).click();
  await expect(
    setup.getByRole("button", { name: "Close input", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(setup).toHaveCount(0);

  // Rearm without opening setup, and keep monitoring off until requested again.
  await arm.click();
  await expect(arm).toHaveAttribute("aria-pressed", "true");
  await expect(monitor).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeEnabled();

  // Lock the destination and input controls until the recording has finalized.
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await expect(arm).toBeDisabled();
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await expect(
    setup.getByRole("button", { name: "Close input", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await record.click();
  await expect(arm).toBeEnabled();
  await expect(page.getByTestId("recorder-clip-take")).toBeVisible();

  // Closing input disarms Capture and makes R open setup again.
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await setup.getByRole("button", { name: "Close input", exact: true }).click();
  await expect(arm).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();
  await page.keyboard.press("Escape");
  await arm.click();
  await expect(
    setup.getByRole("button", { name: "Enable input", exact: true }),
  ).toBeVisible();
});

test("R opens shared setup and permission failure leaves Capture unarmed", async ({
  page,
}) => {
  // Simulate a first denied permission request before allowing real fake-device setup.
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const enumerateDevices = media.enumerateDevices.bind(media);
    const getUserMedia = media.getUserMedia.bind(media);
    let access = false;
    let deny = true;
    media.enumerateDevices = () =>
      access ? enumerateDevices() : Promise.resolve([]);
    media.getUserMedia = async (constraints) => {
      if (deny) {
        deny = false;
        throw new DOMException("Microphone access denied", "NotAllowedError");
      }
      const stream = await getUserMedia(constraints);
      access = true;
      return stream;
    };
  });
  await createRecorderProject(page);
  const arm = page.getByTestId("recorder-arm-toggle");
  const record = page.getByTestId("recorder-record-button");
  const setup = page.getByTestId("recorder-input-setup");
  await expect(record).toBeDisabled();
  await arm.click();
  await expect(setup).toBeVisible();

  // Report denied access in the modal without arming or starting recording.
  await setup
    .getByRole("button", { name: "Grant access", exact: true })
    .click();
  await expect(
    setup.getByText("Microphone access denied", { exact: true }),
  ).toBeVisible();
  await expect(arm).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();

  // Retry permission and enable input, leaving the recording destination unarmed.
  await setup
    .getByRole("button", { name: "Grant access", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(
    setup.getByRole("button", { name: "Close input", exact: true }),
  ).toBeVisible();
  await expect(
    setup.getByText("Microphone access denied", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(arm).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();

  // Arm explicitly after setup to enable recording and show the selected route.
  await arm.click();
  await expect(record).toBeEnabled();
  await expect(
    page.getByText("Fake Default Audio Input · Channel 1"),
  ).toBeVisible();
});
