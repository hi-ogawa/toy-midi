import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";

useFakeAudioInput();

test("completes the latency checker workflow with fake audio", async ({
  page,
  context,
}) => {
  // Open the checker with permission to inspect copied diagnostic reports.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/latency-checker");

  await expect(page.getByLabel("Browser audio input")).toContainText(
    "Fake Default Audio Input",
  );
  const connectStep = page.getByTestId("step-connect-audio");
  const measureStep = page.getByTestId("step-measure-latency");
  const reviewStep = page.getByTestId("step-review-results");
  await expect(connectStep).toHaveAttribute("data-state", "active");
  await expect(measureStep).toHaveAttribute("data-state", "disabled");
  await expect(reviewStep).toHaveAttribute("data-state", "disabled");

  // Enable the input and expose live browser latency and format readings.
  await page.getByRole("button", { name: "Start monitoring" }).click();
  await expect(page.getByLabel("Channel")).toContainText("Channel 1 of");
  await expect(connectStep).toHaveAttribute("data-state", "active");
  await expect(measureStep).toHaveAttribute("data-state", "active");
  await expect(reviewStep).toHaveAttribute("data-state", "disabled");

  const live = page.getByRole("region", { name: "Browser latency estimates" });
  await expect(live).toContainText("Base latency");
  await expect(live).toContainText("Input sample rate");
  await live.getByText("Input and output details", { exact: true }).click();
  await expect(live).toContainText("Echo cancellation");
  await expect(live).toContainText("System default");
  await live.getByRole("button", { name: "Copy diagnostic report" }).click();
  await expect(live.getByRole("status")).toHaveText(
    "Diagnostic report copied.",
  );
  const liveReport = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(liveReport.diagnostics.contextSampleRate).toBeGreaterThan(0);
  expect(liveReport.diagnostics.selectedChannel).toBe(0);
  expect(liveReport.diagnostics.echoCancellation).toBe(false);
  expect(liveReport.diagnostics.userAgent).toBeTruthy();
  expect(liveReport.measurement).toBeUndefined();
  expect(JSON.stringify(liveReport)).not.toMatch(/deviceId|groupId/);

  // Run fake-input calibration and retain its readings without accepting weak detections.
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(reviewStep).toHaveAttribute("data-state", "active", {
    timeout: 15_000,
  });
  await expect(connectStep).toHaveAttribute("data-state", "complete");
  await expect(measureStep).toHaveAttribute("data-state", "complete");
  await expect(page.getByText("Click 7", { exact: true })).toBeVisible();
  await expect(page.getByText("weak correlation")).toBeVisible();

  const recorded = page.getByRole("region", { name: "Recorded diagnostics" });
  await expect(recorded).toContainText("Unavailable: weak detection");
  await recorded
    .getByRole("button", { name: "Copy diagnostic report" })
    .click();
  await expect(recorded.getByRole("status")).toHaveText(
    "Diagnostic report copied.",
  );
  const report = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(report.measurement.measurements).toHaveLength(7);
  expect(report.measurement.reliable).toBe(false);
  expect(report.measurement.residualMs).toBeUndefined();
  expect(report.endDiagnostics.contextSampleRate).toBe(
    report.diagnostics.contextSampleRate,
  );
  expect(Date.parse(report.endDiagnostics.capturedAt)).toBeGreaterThan(
    Date.parse(report.diagnostics.capturedAt),
  );
  expect(JSON.stringify(report)).not.toMatch(/deviceId|groupId/);

  // Audition the raw capture, then stop input and clear the route-specific diagnostics.
  const rawPlayback = page.getByRole("button", {
    name: "Play raw comparison",
  });
  await rawPlayback.click();
  await expect(
    page.getByRole("button", { name: "Stop raw playback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop raw playback" }).click();
  await expect(rawPlayback).toBeVisible();
  await page.getByRole("button", { name: "Stop monitoring" }).click();
  await expect(live).toHaveCount(0);
  await expect(recorded).toHaveCount(0);
});
