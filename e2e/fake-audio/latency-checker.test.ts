import { expect, test } from "@playwright/test";

test("completes the latency checker workflow with fake audio", async ({
  page,
}) => {
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

  await page.getByRole("button", { name: "Start monitoring" }).click();
  await expect(page.getByLabel("Channel")).toContainText("Channel 1 of");
  await expect(connectStep).toHaveAttribute("data-state", "active");
  await expect(measureStep).toHaveAttribute("data-state", "active");
  await expect(reviewStep).toHaveAttribute("data-state", "disabled");

  await page.getByRole("button", { name: "Start test" }).click();
  await expect(reviewStep).toHaveAttribute("data-state", "active", {
    timeout: 15_000,
  });
  await expect(connectStep).toHaveAttribute("data-state", "complete");
  await expect(measureStep).toHaveAttribute("data-state", "complete");
  await expect(page.getByText("Click 7", { exact: true })).toBeVisible();
  await expect(page.getByText("weak correlation")).toBeVisible();

  const rawPlayback = page.getByRole("button", {
    name: "Play raw comparison",
  });
  await rawPlayback.click();
  await expect(
    page.getByRole("button", { name: "Stop raw playback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop raw playback" }).click();
  await expect(rawPlayback).toBeVisible();
});
