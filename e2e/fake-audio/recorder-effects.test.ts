import { expect, test } from "@playwright/test";
import { addRecorderAudio, createRecorderProject } from "./recorder-helpers";

test("edits and persists independent Audio and Capture EQ settings", async ({
  page,
}) => {
  // Open independent effects panels for backing audio and Capture.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  await page.getByTestId("recorder-mixer-button").click();
  await page
    .getByRole("button", { name: "Audio 1 effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  const audio = page.getByTestId("recorder-effects-panel").filter({
    has: page.getByRole("heading", { name: "Audio 1 Effects", exact: true }),
  });
  const capture = page.getByTestId("recorder-effects-panel").filter({
    has: page.getByRole("heading", { name: "Capture Effects", exact: true }),
  });

  // Verify the default EQ settings on Audio.
  await expect(audio.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "1000",
  );
  await expect(
    audio.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("0");
  await expect(
    audio.getByRole("textbox", { name: "Q", exact: true }),
  ).toHaveValue("1");
  await expect(
    audio.getByRole("checkbox", { name: "Bypass" }),
  ).not.toBeChecked();

  // Set different EQ values for Audio and Capture.
  await audio.getByRole("textbox", { name: "Frequency" }).fill("500");
  await audio.getByRole("textbox", { name: "Frequency" }).press("Enter");
  await audio.getByRole("textbox", { name: "Gain", exact: true }).fill("6");
  await audio
    .getByRole("textbox", { name: "Gain", exact: true })
    .press("Enter");
  await audio.getByRole("textbox", { name: "Q", exact: true }).fill("2");
  await audio.getByRole("textbox", { name: "Q", exact: true }).press("Enter");
  await audio.getByRole("checkbox", { name: "Bypass" }).check();
  await capture.getByRole("textbox", { name: "Gain", exact: true }).fill("-4");
  await capture
    .getByRole("textbox", { name: "Gain", exact: true })
    .press("Enter");

  // Save and reload the independent EQ settings.
  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(page.getByTestId("recorder-effects-panel")).toHaveCount(0);
  await page.getByTestId("recorder-mixer-button").click();
  await page
    .getByRole("button", { name: "Audio 1 effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  await expect(audio.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "500",
  );
  await expect(
    audio.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("6");
  await expect(
    audio.getByRole("textbox", { name: "Q", exact: true }),
  ).toHaveValue("2");
  await expect(audio.getByRole("checkbox", { name: "Bypass" })).toBeChecked();
  await expect(
    capture.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("-4");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Resetting Audio leaves Capture unchanged and dirties the project.
  await audio.getByRole("button", { name: "Reset" }).click();
  await expect(audio.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "1000",
  );
  await expect(
    audio.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("0");
  await expect(
    audio.getByRole("textbox", { name: "Q", exact: true }),
  ).toHaveValue("1");
  await expect(
    audio.getByRole("checkbox", { name: "Bypass" }),
  ).not.toBeChecked();
  await expect(
    capture.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("-4");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await page.screenshot({ path: test.info().outputPath("effects.png") });
});

test("edits EQ with graph clicks and wheel gestures", async ({ page }) => {
  await createRecorderProject(page);
  await page.getByTestId("recorder-mixer-button").click();
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  const panel = page.getByTestId("recorder-effects-panel");
  await expect(panel.getByTestId("eq-response-graph")).toBeVisible();
  const point = await panel.getByTestId("eq-response-point").boundingBox();
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x + point!.width / 2 + 30, point!.y - 20);
  const frequencyInput = panel.getByRole("textbox", { name: "Frequency" });
  const gainInput = panel.getByRole("textbox", { name: "Gain", exact: true });
  await expect
    .poll(async () => Number(await frequencyInput.inputValue()))
    .toBeGreaterThan(1000);
  await expect
    .poll(async () => Number(await gainInput.inputValue()))
    .toBeGreaterThan(0);
  const frequency = await frequencyInput.inputValue();
  const gain = await gainInput.inputValue();
  // Wheel adjusts bandwidth independently.
  const qInput = panel.getByRole("textbox", { name: "Q", exact: true });
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => Number(await qInput.inputValue()))
    .toBeGreaterThan(1);
  await page.mouse.wheel(0, 100);
  await expect(qInput).toHaveValue("1");
  await expect(frequencyInput).toHaveValue(frequency);
  await expect(gainInput).toHaveValue(gain);
  await panel.getByRole("checkbox", { name: "Bypass" }).check();
  await expect(panel.getByTestId("eq-response-curve")).toHaveClass(
    /stroke-blue-400\/35/,
  );
  await panel.getByRole("checkbox", { name: "Bypass" }).uncheck();

  // Optional sliders can be shown and hidden beside the graph controls.
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Show sliders", exact: true })
    .click();
  await expect(panel.getByRole("slider")).toHaveCount(3);
  await panel
    .getByRole("button", { name: "Hide sliders", exact: true })
    .click();
  await expect(panel.getByRole("slider")).toHaveCount(0);
});

test("toggles multiple track panels and closes them with the mixer or track", async ({
  page,
}) => {
  // Open effects for multiple tracks at once from the mixer.
  await createRecorderProject(page);
  await page.getByTitle("Add empty audio track").click();
  await page.getByTitle("Add empty audio track").click();
  const mixerToggle = page.getByTestId("recorder-mixer-button");
  const panels = page.getByTestId("recorder-effects-panel");
  const audioFx = page.getByRole("button", {
    name: "Audio 1 effects",
    exact: true,
  });
  await mixerToggle.click();
  await audioFx.click();
  await page
    .getByRole("button", { name: "Audio 2 effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  await expect(panels).toHaveCount(3);

  // Toggle or explicitly close an individual effects panel.
  await audioFx.click();
  await expect(panels).toHaveCount(2);
  await audioFx.click();
  await page
    .getByRole("button", { name: "Close Audio 1 Effects", exact: true })
    .click();
  await expect(audioFx).toHaveAttribute("aria-pressed", "false");

  // Closing the mixer clears its effects panels instead of restoring them later.
  await mixerToggle.click();
  await expect(panels).toHaveCount(0);
  await mixerToggle.click();
  await expect(panels).toHaveCount(0);
  await audioFx.click();
  await page.getByRole("button", { name: "Close Mixer", exact: true }).click();
  await mixerToggle.click();
  await expect(panels).toHaveCount(0);

  // Removing a track also removes its open effects panel.
  await audioFx.click();
  const firstTrack = page.getByTestId("recorder-audio-track-row").first();
  await firstTrack.getByTitle("Audio 1 actions").click();
  await page
    .getByRole("menuitem", { name: "Remove track", exact: true })
    .click();
  await expect(panels).toHaveCount(0);
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(1);
});

test("keeps the mixer usable with many effects panels open", async ({
  page,
}) => {
  // Fill the effects area beyond the available viewport width.
  await page.setViewportSize({ width: 1280, height: 900 });
  await createRecorderProject(page);
  for (let index = 0; index < 5; index++) {
    await page.getByTitle("Add empty audio track").click();
  }
  await page.getByTestId("recorder-mixer-button").click();
  for (let index = 1; index <= 5; index++) {
    await page
      .getByRole("button", { name: `Audio ${index} effects`, exact: true })
      .click();
  }
  const panels = page.getByTestId("recorder-effects-panel");
  await expect(panels).toHaveCount(5);
  const mixer = page.getByTestId("recorder-mixer-panel");

  // Horizontal scrolling brings the clipped final panel into view.
  await expect(panels.first()).toBeInViewport();
  await expect(panels.last()).not.toBeInViewport();
  await panels.last().scrollIntoViewIfNeeded();
  await expect(panels.last()).toBeInViewport();
  await expect(panels.first()).not.toBeInViewport();

  // Each panel remains reachable and closable.
  for (let index = 5; index >= 1; index--) {
    await page
      .getByRole("button", {
        name: `Close Audio ${index} Effects`,
        exact: true,
      })
      .click();
  }
  await expect(page.getByTestId("recorder-effects-panel")).toHaveCount(0);
  await mixer.getByRole("button", { name: "Close Mixer", exact: true }).click();
  await expect(mixer).toHaveCount(0);
});
