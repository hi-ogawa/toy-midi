import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  expectChannelPlaying,
  expectChannelSilent,
} from "./helpers";

test.describe("Audio Output - Metronome", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("metronome produces audio output when enabled and playing", async ({
    page,
  }) => {
    // Enable metronome
    await page.getByTestId("metronome-toggle").click();
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Should be silent before playback
    await expectChannelSilent(page, "metronome");

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Should detect audio output (metronome clicks)
    await expectChannelPlaying(page, "metronome");

    // Stop playback
    await page.getByTestId("play-pause-button").click();
  });

  test("no metronome audio when disabled", async ({ page }) => {
    // Ensure metronome is off (default)
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Wait a bit for any potential audio
    await page.waitForTimeout(500);

    // Should remain silent on metronome channel
    await expectChannelSilent(page, "metronome");
  });
});
