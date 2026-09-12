import { expect, test } from "@playwright/test";
import { addRecorderAudio, createRecorderProject } from "./recorder-helpers";

test("edits and persists independent Audio and Capture EQ settings", async ({
  page,
}) => {
  // Open independent effects panels for backing audio and Capture.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
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
    audio.getByRole("checkbox", { name: "Bypass" }).first(),
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
  await audio.getByRole("button", { name: "Add band" }).click();
  await audio.getByRole("textbox", { name: "Frequency" }).fill("3000");
  await audio.getByRole("textbox", { name: "Frequency" }).press("Enter");
  await audio.getByRole("checkbox", { name: "Bypass" }).first().check();
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
  await page
    .getByRole("button", { name: "Audio 1 effects", exact: true })
    .click();
  await expect(audio.getByTestId("eq-response-point")).toHaveCount(2);
  await audio.getByRole("button", { name: "Select band 1" }).click();
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
  await expect(
    audio.getByRole("checkbox", { name: "Bypass" }).first(),
  ).toBeChecked();
  await audio.getByRole("button", { name: "Select band 2" }).click();
  await expect(audio.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "3000",
  );
  await expect(
    capture.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("-4");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Resetting Audio leaves Capture unchanged and dirties the project.
  await audio.getByRole("button", { name: "Reset EQ" }).click();
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
    audio.getByRole("checkbox", { name: "Bypass" }).first(),
  ).not.toBeChecked();
  await expect(
    capture.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("-4");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await page.screenshot({ path: test.info().outputPath("effects.png") });
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
      .getByTestId("recorder-mixer-panel")
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
