import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  waitForRecordingSamples,
} from "./recorder-helpers";

test("header permission setup leaves input closed and R opens the selected device", async ({
  page,
}) => {
  // Hide devices until access is requested to exercise the first-use permission UI.
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const enumerateDevices = media.enumerateDevices.bind(media);
    const getUserMedia = media.getUserMedia.bind(media);
    let access = false;
    media.enumerateDevices = () =>
      access ? enumerateDevices() : Promise.resolve([]);
    media.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      access = true;
      return stream;
    };
  });
  await createRecorderProject(page);
  const inputToggle = page.getByTestId("recorder-input-toggle");
  const record = page.getByTestId("recorder-record-button");
  const setup = page.getByTestId("recorder-input-setup");

  // Keep R disabled with a setup hint until microphone access is granted.
  await expect(inputToggle).toBeDisabled();
  await expect(inputToggle).toHaveAttribute(
    "title",
    "Microphone access required. Configure input first.",
  );
  await expect(setup).toHaveCount(0);

  // Grant permission from the header without enabling Capture.
  await page
    .getByRole("button", { name: "Allow microphone access", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Allow microphone access", exact: true })
    .click();
  await expect(setup).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Allow microphone access", exact: true }),
  ).toHaveCount(0);
  await expect(inputToggle).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();

  // Choose a device through the independent configuration entry point.
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Configure input…" }).click();
  await expect(setup.getByLabel("Device")).toContainText(
    "Fake Default Audio Input",
  );
  await setup
    .getByLabel("Device")
    .selectOption({ label: "Fake Audio Input 1" });
  await page.keyboard.press("Escape");

  // Open the chosen input directly with R, then enable monitoring.
  await inputToggle.click();
  await expect(inputToggle).toHaveAttribute("aria-pressed", "true");
  await expect(setup).toHaveCount(0);
  await expect(
    page.getByText("Fake Audio Input 1 · Channel 1", { exact: true }),
  ).toBeVisible();
  const monitor = page.getByTestId("recorder-input-monitor");
  await monitor.click();
  await expect(monitor).toHaveAttribute("aria-pressed", "true");

  // Preserve today's R toggle behavior by closing input and stopping monitoring.
  await inputToggle.click();
  await expect(record).toBeDisabled();
  await expect(monitor).toHaveCount(0);
  await inputToggle.click();
  await expect(monitor).toHaveAttribute("aria-pressed", "false");

  // Keep input changes disabled until recording finishes.
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await expect(inputToggle).toBeDisabled();
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await expect(
    setup.getByRole("button", { name: "Disable input", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await record.click();
  await expect(inputToggle).toBeEnabled();
});

test("permission retry leaves input closed until R is clicked", async ({
  page,
}) => {
  // Deny the first permission request, then allow real fake-device setup on retry.
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
  const inputToggle = page.getByTestId("recorder-input-toggle");
  const record = page.getByTestId("recorder-record-button");
  const setup = page.getByTestId("recorder-input-setup");

  // Open setup from the header and report denied access without enabling R.
  await expect(inputToggle).toBeDisabled();
  await page
    .getByRole("button", { name: "Allow microphone access", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Allow microphone access", exact: true })
    .click();
  await expect(
    setup.getByText("Microphone access denied", { exact: true }),
  ).toBeVisible();
  await expect(inputToggle).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();

  // Retry permission without opening input automatically.
  await setup
    .getByRole("button", { name: "Allow microphone access", exact: true })
    .click();
  await expect(setup).toHaveCount(0);
  await expect(inputToggle).toBeEnabled();
  await expect(inputToggle).toHaveAttribute("aria-pressed", "false");
  await expect(record).toBeDisabled();

  // Open the input explicitly with R after permission is available.
  await inputToggle.click();
  await expect(inputToggle).toHaveAttribute("aria-pressed", "true");
  await expect(record).toBeEnabled();
  await expect(
    page.getByText("Fake Default Audio Input · Channel 1"),
  ).toBeVisible();
});
