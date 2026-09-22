import { expect, test } from "@playwright/test";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
} from "./recorder-helpers";

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
  // Filter types expose only their applicable controls and keep stored values.
  const filterType = audio.getByRole("combobox", { name: "Filter type" });
  await expect(filterType).toHaveValue("peaking");
  await filterType.selectOption("low-shelf");
  await expect(
    audio.getByRole("textbox", { name: "Gain", exact: true }),
  ).toBeVisible();
  await expect(
    audio.getByRole("textbox", { name: "Q", exact: true }),
  ).toHaveCount(0);
  await filterType.selectOption("low-pass");
  await expect(
    audio.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveCount(0);
  await expect(
    audio.getByRole("textbox", { name: "Q", exact: true }),
  ).toHaveValue("2");
  await filterType.selectOption("low-shelf");
  await audio.getByRole("button", { name: "Add band" }).click();
  await audio.getByRole("textbox", { name: "Frequency" }).fill("3000");
  await audio.getByRole("textbox", { name: "Frequency" }).press("Enter");
  await audio.getByRole("checkbox", { name: "Bypass" }).first().check();
  await capture.getByRole("textbox", { name: "Gain", exact: true }).fill("-4");
  await capture
    .getByRole("textbox", { name: "Gain", exact: true })
    .press("Enter");

  await capture
    .getByRole("combobox", { name: "Filter type" })
    .selectOption("high-shelf");

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
  await expect(filterType).toHaveValue("low-shelf");
  await filterType.selectOption("peaking");
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
  await filterType.selectOption("low-shelf");
  await audio.getByRole("button", { name: "Select band 2" }).click();
  await expect(filterType).toHaveValue("peaking");
  await expect(audio.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "3000",
  );
  await expect(
    capture.getByRole("textbox", { name: "Gain", exact: true }),
  ).toHaveValue("-4");
  await expect(
    capture.getByRole("combobox", { name: "Filter type" }),
  ).toHaveValue("high-shelf");

  await save.click();
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

test("resizes an effects panel", async ({ page }) => {
  // Open Capture effects with room to grow the panel.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createRecorderProject(page);
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  const panel = page.getByTestId("recorder-effects-panel");
  const initial = (await panel.boundingBox())!;

  // Drag the top-left corner to increase the panel's width and height.
  await dragBy(
    page,
    panel.getByRole("button", { name: "Resize Capture Effects" }),
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
    panel.getByRole("button", { name: "Resize Capture Effects" }),
    0,
    { deltaY: 150 },
  );
  expect((await graph.boundingBox())!.height).toBeLessThan(before.height);
});

for (const format of ["single", "multiband"] as const) {
  test(`loads ${format} EQ settings without filter types as peaking`, async ({
    page,
  }) => {
    // Save an Audio track and Capture, then emulate their pre-type persisted shape.
    await createRecorderProject(page);
    await page.getByTitle("Add empty audio track").click();
    const save = page.getByTestId("recorder-save-button");
    await save.click();
    await expect(save).toHaveAttribute("data-status", "saved");
    const projectId = page.url().split("/").at(-1)!;
    await page.evaluate(
      async ({ projectId, format }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("toy-midi-recorder", 3);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("projects", "readwrite");
        const store = transaction.objectStore("projects");
        const project = await new Promise<{
          content: {
            audioTracks: { eq: unknown }[];
            recordingTrack: { eq: unknown };
          };
        }>((resolve, reject) => {
          const request = store.get(projectId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const oldBand = { frequency: 750, gain: 2, q: 1.5, bypass: false };
        const eq =
          format === "single"
            ? oldBand
            : {
                bypass: false,
                bands: [{ id: "legacy-band", ...oldBand }],
              };
        for (const track of project.content.audioTracks) {
          track.eq = eq;
        }
        project.content.recordingTrack.eq = eq;
        store.put(project);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        database.close();
      },
      { projectId, format },
    );

    // Reload both channels and preserve values while supplying the peaking default.
    await page.reload();
    for (const label of ["Audio 1", "Capture"]) {
      await page
        .getByRole("button", { name: `${label} effects`, exact: true })
        .click();
      const panel = page.getByTestId("recorder-effects-panel").filter({
        has: page.getByRole("heading", {
          name: `${label} Effects`,
          exact: true,
        }),
      });
      await expect(
        panel.getByRole("combobox", { name: "Filter type" }),
      ).toHaveValue("peaking");
      await expect(
        panel.getByRole("textbox", { name: "Frequency" }),
      ).toHaveValue("750");
      await expect(
        panel.getByRole("textbox", { name: "Gain", exact: true }),
      ).toHaveValue("6.02");
      await expect(
        panel.getByRole("textbox", { name: "Q", exact: true }),
      ).toHaveValue("1.5");
    }
  });
}
