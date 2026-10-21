import { expect, test } from "@playwright/test";
import { addAudio, createProject, dragBy } from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("edits and persists independent EQ settings per audio track", async ({
  page,
}) => {
  // Open independent effects panels for capture on Audio 1 and backing audio on Audio 2.
  await createProject(page);
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  await selectMenuItem(page, { menu: "Audio 2 actions", item: "Effects…" });
  const capture = page.getByTestId("effects-panel").filter({
    has: page.getByRole("heading", { name: "Audio 1 Effects", exact: true }),
  });
  const audio = page.getByTestId("effects-panel").filter({
    has: page.getByRole("heading", { name: "Audio 2 Effects", exact: true }),
  });

  // Verify the default EQ settings on the backing track.
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

  // Set different EQ values for each track.
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

  // Save and reload, and both panels come back with their EQ settings.
  const save = page.getByTestId("save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(page.getByTestId("effects-panel")).toHaveCount(2);
  await expect(audio.getByTestId("eq-response-point")).toHaveCount(2);
  await audio.getByRole("button", { name: "Select band 1" }).click();
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

  // Resetting the backing track leaves Audio 1 unchanged and dirties the project.
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
});

test("switches a band between peaking, low-pass, and high-pass", async ({
  page,
}) => {
  // Boost Audio 1's band by 6 dB.
  await createProject(page);
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const panel = page.getByTestId("effects-panel");
  const filterType = panel.getByRole("combobox", { name: "Filter type" });
  const gain = panel.getByRole("textbox", { name: "Gain", exact: true });
  const q = panel.getByRole("textbox", { name: "Q", exact: true });
  await expect(filterType).toHaveValue("peaking");
  await gain.fill("6");
  await gain.press("Enter");

  // Switch to low-pass, which hides the gain and starts Q at Butterworth.
  await filterType.selectOption("low-pass");
  await expect(gain).toHaveCount(0);
  await expect(q).toHaveValue("0.71");

  // Switch to high-pass, which keeps the pass filter's Q.
  await q.fill("2");
  await q.press("Enter");
  await filterType.selectOption("high-pass");
  await expect(q).toHaveValue("2");

  // Save and reload, and the band is still a high-pass.
  const save = page.getByTestId("save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  await expect(filterType).toHaveValue("high-pass");
  await expect(q).toHaveValue("2");

  // Switch back to peaking, and the band keeps the gain it had.
  await filterType.selectOption("peaking");
  await expect(gain).toHaveValue("6");
});

test("keeps the mixer usable with many effects panels open", async ({
  page,
}) => {
  // Fill the effects area beyond the available viewport width.
  await page.setViewportSize({ width: 1280, height: 900 });
  await createProject(page);
  for (let index = 0; index < 5; index++) {
    await page.getByTitle("Add empty audio track").click();
  }
  await page.getByTestId("mixer-button").click();
  for (let index = 1; index <= 5; index++) {
    await page
      .getByTestId("mixer-panel")
      .getByRole("button", { name: `Audio ${index} effects`, exact: true })
      .click();
  }
  const panels = page.getByTestId("effects-panel");
  await expect(panels).toHaveCount(5);
  const mixer = page.getByTestId("mixer-panel");

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
  await expect(page.getByTestId("effects-panel")).toHaveCount(0);
  await mixer.getByRole("button", { name: "Close Mixer", exact: true }).click();
  await expect(mixer).toHaveCount(0);
});

test("resizes an effects panel", async ({ page }) => {
  // Open Audio 1 effects with room to grow the panel.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createProject(page);
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const panel = page.getByTestId("effects-panel");
  const initial = (await panel.boundingBox())!;

  // Drag the top-left corner to increase the panel's width and height.
  await dragBy(
    page,
    panel.getByRole("button", { name: "Resize Audio 1 Effects" }),
    -100,
    { deltaY: -100 },
  );
  const resized = (await panel.boundingBox())!;
  expect(resized.width).toBeCloseTo(initial.width + 100, 0);
  expect(resized.height).toBeCloseTo(initial.height + 100, 0);

  // Shorten the panel and check that the graph shrinks with it.
  const graph = panel.getByTestId("eq-response-graph");
  const before = (await graph.boundingBox())!;
  await dragBy(
    page,
    panel.getByRole("button", { name: "Resize Audio 1 Effects" }),
    0,
    { deltaY: 150 },
  );
  expect((await graph.boundingBox())!.height).toBeLessThan(before.height);
});

test("shows in the mixer whether a track's EQ is on", async ({ page }) => {
  // Open the mixer, where Audio 1 starts with a flat EQ.
  await createProject(page);
  await page.getByTestId("mixer-button").click();
  const toggle = page.getByRole("button", {
    name: "Audio 1 effects",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("title", "Open Audio 1 effects");

  // Boost the band, and the mixer marks the EQ as on.
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const panel = page.getByTestId("effects-panel");
  const gain = panel.getByRole("textbox", { name: "Gain", exact: true });
  await gain.fill("3");
  await gain.press("Enter");
  await expect(toggle).toHaveAttribute(
    "title",
    "Close Audio 1 effects (EQ on)",
  );

  // Flatten the band and make it a low-pass, which changes the sound at any
  // gain, so the mark stays.
  await gain.fill("0");
  await gain.press("Enter");
  await expect(toggle).toHaveAttribute("title", "Close Audio 1 effects");
  await panel
    .getByRole("combobox", { name: "Filter type" })
    .selectOption("low-pass");
  await expect(toggle).toHaveAttribute(
    "title",
    "Close Audio 1 effects (EQ on)",
  );

  // Bypass the EQ, and the mark goes away.
  await panel.getByRole("checkbox", { name: "Bypass" }).first().check();
  await expect(toggle).toHaveAttribute("title", "Close Audio 1 effects");
});

test("adds, persists, and removes a track's amp", async ({ page }) => {
  // Open Audio 1 effects, which start without an amp.
  await createProject(page);
  await page.getByTestId("mixer-button").click();
  const toggle = page.getByRole("button", {
    name: "Audio 1 effects",
    exact: true,
  });
  await toggle.click();
  const panel = page.getByTestId("effects-panel");
  const addAmp = panel.getByRole("button", { name: "Add amp" });
  await expect(panel.getByRole("heading", { name: "Amp" })).toHaveCount(0);

  // Add the amp, which starts on Crunch with the cabinet, and the mixer marks it as on.
  await addAmp.click();
  await expect(addAmp).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Crunch" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(panel.getByRole("checkbox", { name: "Cabinet" })).toBeChecked();
  await expect(toggle).toHaveAttribute(
    "title",
    "Close Audio 1 effects (amp on)",
  );

  // Switch to High gain without the cabinet.
  await panel.getByRole("button", { name: "High gain" }).click();
  await panel.getByRole("checkbox", { name: "Cabinet" }).uncheck();

  // Save and reload, and the amp keeps its settings.
  const save = page.getByTestId("save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  await expect(
    panel.getByRole("button", { name: "High gain" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("checkbox", { name: "Cabinet" }),
  ).not.toBeChecked();

  // Remove the amp, and the Add amp button comes back.
  await panel.getByRole("button", { name: "Remove amp" }).click();
  await expect(panel.getByRole("heading", { name: "Amp" })).toHaveCount(0);
  await expect(addAmp).toBeVisible();
  await expect(save).toHaveAttribute("data-status", "unsaved");
});
