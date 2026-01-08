import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Audio Playback", () => {
  test("loads audio file via input and enables play button", async ({
    page,
  }) => {
    await page.goto("/");

    const playButton = page.getByTestId("play-pause-button");
    const timeDisplay = page.getByTestId("time-display");

    // Load the test audio file via file input
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);

    // Wait for file to load - file name should appear
    await expect(page.getByTestId("audio-file-name")).toHaveText(
      "test-audio.wav",
      { timeout: 5000 },
    );

    // Play button should now be enabled (duration > 0)
    await expect(playButton).toBeEnabled({ timeout: 5000 });

    // Duration should be non-zero
    await expect(timeDisplay).not.toHaveText("0:00 / 0:00");
  });
});
