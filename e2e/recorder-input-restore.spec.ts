import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  enableInput,
  openInputPanel,
} from "./recorder-helpers";

useFakeAudioInput({ requireUserGesture: true });

test("restores input after interaction and remembers explicit off", async ({
  page,
}) => {
  // Enable input and reload with the remembered power choice.
  await createRecorderProject(page);
  await enableInput(page);
  await page.reload();
  // The monitor toggle is enabled only while input is on. Observe input state
  // through it because opening the Audio Input panel needs a click, and any
  // click is the user gesture that restores input.
  const monitorToggle = page.getByTestId("recorder-input-monitor");
  await expect(monitorToggle).toBeDisabled();

  // Press a key to restore input without arming or monitoring.
  await page.keyboard.press("Shift");
  await expect(monitorToggle).toBeEnabled();
  const panel = await openInputPanel(page);
  const inputPower = panel.getByRole("button", { name: "Input power" });
  await expect(inputPower).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("recorder-arm-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(monitorToggle).toHaveAttribute("aria-pressed", "false");

  // Turn input off and keep it off through more interactions and a reload.
  await inputPower.click();
  await page.keyboard.press("Escape");
  await expect(monitorToggle).toBeDisabled();
  await page.reload();
  await openInputPanel(page);
  await expect(inputPower).toHaveAttribute("aria-pressed", "false");
  await expect(monitorToggle).toBeDisabled();
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
    panel.getByRole("button", { name: "Input power" }),
  ).toHaveAttribute("aria-pressed", "true");
});
