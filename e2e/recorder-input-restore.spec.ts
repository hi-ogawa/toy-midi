import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  enableInput,
  openInputPanel,
} from "./recorder-helpers";

useFakeAudioInput();
test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("restores input after interaction and remembers explicit off", async ({
  page,
}) => {
  // Enable input and reload with the remembered power choice.
  await createRecorderProject(page);
  await enableInput(page);
  await page.reload();
  const monitor = page.getByTestId("recorder-input-monitor");
  await expect(monitor).toBeDisabled();

  // Press a key to restore input without arming or monitoring.
  await page.keyboard.press("Shift");
  await expect(monitor).toBeEnabled();
  const panel = await openInputPanel(page);
  await expect(
    panel.getByRole("button", { name: "Turn input off" }),
  ).toBeEnabled();
  await expect(page.getByTestId("recorder-arm-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(monitor).toHaveAttribute("aria-pressed", "false");

  // Turn input off and keep it off through more interactions and a reload.
  await panel.getByRole("button", { name: "Turn input off" }).click();
  await page.keyboard.press("Escape");
  await expect(monitor).toBeDisabled();
  await page.reload();
  await openInputPanel(page);
  await expect(
    panel.getByRole("button", { name: "Turn input on" }),
  ).toBeEnabled();
  await expect(monitor).toBeDisabled();
});

test("remembers an interaction before device discovery finishes", async ({
  page,
}) => {
  // Remember input on, then hold device enumeration during reload.
  await createRecorderProject(page);
  await enableInput(page);
  await page.addInitScript(() => {
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(
      navigator.mediaDevices,
    );
    const released = new Promise<void>((resolve) =>
      window.addEventListener("release-input-devices", () => resolve(), {
        once: true,
      }),
    );
    navigator.mediaDevices.enumerateDevices = async () => {
      await released;
      return enumerate();
    };
  });
  await page.reload();

  // Interact while loading, then finish discovery without another gesture.
  const panel = await openInputPanel(page);
  await expect(panel.getByText("Loading audio inputs…")).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("release-input-devices")),
  );
  await expect(
    panel.getByRole("button", { name: "Turn input off" }),
  ).toBeEnabled();
});
