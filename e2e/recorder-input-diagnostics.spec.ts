import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject } from "./recorder-helpers";

useFakeAudioInput();

test("inspect and copy live editor input diagnostics", async ({
  page,
  context,
}) => {
  // Open debug readings without activating capture or assuming missing latency is zero.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await createRecorderProject(page);
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  const readings = setup.getByRole("region", { name: "Audio debug readings" });
  await expect(readings).toHaveCount(0);
  await setup.getByText("Audio debug", { exact: true }).click();
  await expect(readings).toContainText("Input disabled");
  await expect(readings).toContainText("Incomplete");
  await expect(
    setup.getByRole("button", { name: "Enable input", exact: true }),
  ).toBeVisible();

  // Enable the real capture path with fake audio and copy its live settings.
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(readings).toContainText("Fake Default Audio Input");
  const compensation = setup.getByRole("textbox");
  await compensation.fill("25");
  await compensation.press("Tab");
  await expect(readings).toContainText("25.000 ms");
  await readings
    .getByRole("button", { name: "Copy diagnostic report" })
    .click();
  await expect(readings.getByRole("status")).toHaveText(
    "Diagnostic report copied.",
  );
  const report = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(report.context.sampleRate).toBeGreaterThan(0);
  expect(report.input.echoCancellation).toBe(false);
  expect(report.input.noiseSuppression).toBe(false);
  expect(report.input.autoGainControl).toBe(false);
  expect(report.observedChannelCount).toBeGreaterThan(0);
  expect(report.selectedChannel).toBe(0);
  expect(report.latencyCompensation).toBe(0.025);
  expect(report.captureStatus).toBe("ready");
  expect(JSON.stringify(report)).not.toMatch(/deviceId|groupId/);

  // Disable capture and copy a fresh report without the previous input's readings.
  await setup
    .getByRole("button", { name: "Disable input", exact: true })
    .click();
  await expect(readings).toContainText("Input disabled");
  await readings
    .getByRole("button", { name: "Copy diagnostic report" })
    .click();
  await expect
    .poll(
      async () =>
        JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
          .captureStatus,
    )
    .toBe("disabled");
  const stopped = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(stopped.input).toBeUndefined();
  expect(stopped.candidateLatency).toBeUndefined();

  // Collapse the panel, then reopen the dialog with debug hidden by default.
  await setup.getByText("Audio debug", { exact: true }).click();
  await expect(readings).toHaveCount(0);
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Configure audio input" }).click();
  await expect(readings).toHaveCount(0);
});
