import { expect, test } from "@playwright/test";
import { createCheckpoint, useFakeAudioInput } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  enableInput,
  saveRecorderProject,
} from "./recorder-helpers";

useFakeAudioInput();

test("cancel calibration and reject weak input without creating a take", async ({
  page,
}) => {
  // Enable monitoring so cancellation must restore it, and save a clean project.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await enableInput(page);
  await page.getByTestId("recorder-input-monitor").click();
  await saveRecorderProject(page);
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  const calibration = setup.getByRole("region", {
    name: "Latency calibration",
  });
  const start = calibration.getByRole("button", {
    name: "Start measurement",
    exact: true,
  });

  // Start a test with controls locked and monitoring muted, then cancel it.
  await start.click();
  await expect(setup.getByRole("combobox", { name: /Device/ })).toBeDisabled();
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await calibration.getByRole("button", { name: "Cancel" }).click();
  await expect(start).toBeVisible();
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Close during a second test, then reopen without an abandoned result or capture.
  await start.click();
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await expect(start).toBeVisible();

  // Finish a fresh fake-input test and refuse to apply its unrelated signal.
  const checkpoint = createCheckpoint();
  await start.click();
  // Measured around 5.4 seconds for seven probes; allow scheduling headroom.
  await expect(
    calibration.getByRole("button", { name: "Measure again" }),
  ).toBeVisible({ timeout: 10_000 });
  checkpoint("calibration finished");
  await expect(calibration.getByRole("alert")).toContainText("Weak detection");
  await expect(
    calibration.getByRole("button", { name: "Apply compensation" }),
  ).toBeDisabled();
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("recorder-clip-recording")).toHaveCount(0);
  await expect(page.getByTestId("recorder-clip-comp-source")).toHaveCount(0);
  await expect(page.getByTestId("recorder-play-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(0);
});

test("measure a known software loop and explicitly apply its compensation", async ({
  page,
}) => {
  // Loop probe sources into the actual capture worklet through a known 20 ms delay.
  // This validates frame accounting and UI; it is not a hardware latency test.
  await page.addInitScript(() => {
    const inputs = new WeakMap<AudioContext, GainNode>();
    Object.defineProperty(AudioContext.prototype, "createMediaStreamSource", {
      value: function (this: AudioContext) {
        const input = this.createGain();
        inputs.set(this, input);
        return input;
      },
    });
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      const context = this;
      const connect = source.connect.bind(source);
      Object.defineProperty(source, "connect", {
        value: (output: AudioNode) => {
          const input = inputs.get(context);
          if (output === context.destination && input) {
            const delay = context.createDelay();
            delay.delayTime.value = 0.02;
            connect(delay);
            delay.connect(input);
          }
          return connect(output);
        },
      });
      return source;
    };
  });
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await enableInput(page);
  await saveRecorderProject(page);
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  const calibration = setup.getByRole("region", {
    name: "Latency calibration",
  });

  // Measure without changing compensation or creating recording edits.
  const checkpoint = createCheckpoint();
  await calibration.getByRole("button", { name: "Start measurement" }).click();
  // Measured 5.4 seconds for seven probes; allow scheduling headroom.
  await expect(
    calibration.getByRole("button", { name: "Apply compensation" }),
  ).toBeVisible({ timeout: 10_000 });
  checkpoint("known-delay calibration finished");
  await expect(calibration.getByRole("alert")).toHaveCount(0);
  const offset = calibration
    .locator("dt", { hasText: "Measured offset" })
    .locator("+ dd");
  expect(parseFloat((await offset.textContent())!)).toBeCloseTo(20, 1);
  await expect(setup.getByRole("textbox")).toHaveValue("0");

  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Audition compensation, stop it, and explicitly apply the measured value.
  await calibration
    .getByRole("button", { name: "Play compensated comparison" })
    .click();
  await expect(calibration.getByRole("status")).toContainText(
    "Playing compensated",
  );
  await calibration.getByRole("button", { name: "Cancel" }).click();
  await expect(
    calibration.getByRole("button", { name: "Apply compensation" }),
  ).toBeEnabled();
  await calibration.getByRole("button", { name: "Apply compensation" }).click();
  await expect(setup.getByRole("textbox")).toHaveValue("20");
  await expect(calibration.getByRole("status")).toContainText(
    "Compensation applied",
  );

  // Disable input to invalidate the result; only explicit Apply dirties the project.
  await setup.getByRole("button", { name: "Disable input" }).click();
  await expect(calibration).toHaveCount(0);
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "unsaved",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(0);
  await expect(page.getByTestId("recorder-clip-comp-source")).toHaveCount(0);
});
