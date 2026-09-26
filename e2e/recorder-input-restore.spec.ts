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

  // See the header input button ask for a gesture before input is restored.
  const inputButton = page.getByRole("button", {
    name: "Audio Input",
    exact: true,
  });
  await expect(inputButton).toHaveAccessibleDescription(
    "Audio Input (click anywhere to turn input back on)",
  );

  // Press a key to restore input without enabling monitoring.
  await page.keyboard.press("Shift");
  await expect(inputButton).toHaveAccessibleDescription(
    "Audio Input (input on)",
  );
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Turn input off and keep it off through a reload without asking for a gesture.
  const panel = await openInputPanel(page);
  const inputPower = panel.getByRole("button", { name: "Input power" });
  await inputPower.click();
  await expect(inputPower).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(inputButton).toHaveAccessibleDescription(
    "Audio Input (input off)",
  );
  await page.keyboard.press("Shift");
  await openInputPanel(page);
  await expect(inputPower).toHaveAttribute("aria-pressed", "false");
});

test("arms a track as the first interaction without prompting for input", async ({
  page,
}) => {
  // Enable input, then reload with Capture unarmed.
  await createRecorderProject(page);
  await enableInput(page);
  await page.reload();

  // Arm Capture as the first gesture, which also restores input.
  const arm = page.getByTestId("recorder-arm-toggle");
  await arm.click();
  await expect(arm).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Audio Input", exact: true }),
  ).toHaveAccessibleDescription("Audio Input (input on)");

  // See the Audio Input panel stay closed, because input was already starting.
  // The panel is checked instead of the prompt toast, which dismisses itself.
  await expect(page.getByTestId("recorder-input-panel")).toBeHidden();
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
