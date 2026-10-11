import { expect, test } from "@playwright/test";
import {
  addAudio,
  createProject,
  getPosition,
  saveProject,
} from "./editor-helpers";

test("saves and restores a project", async ({ page }) => {
  // Create a project and show its default name in the browser tab.
  await createProject(page);
  await expect(page).toHaveTitle("Untitled - Toy MIDI");
  const projectUrl = page.url();
  const saveButton = page.getByTestId("save-button");
  await expect(saveButton).toHaveAttribute("data-status", "saved");
  const saveTooltip = page.getByRole("tooltip");
  await expect(saveButton).not.toHaveAttribute("title");
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.hover();
  await expect(saveTooltip).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.focus();
  await expect(saveTooltip).toHaveCSS("opacity", "1");

  // Transport updates are session state and do not stale persisted state.
  await page.getByTestId("play-button").click();
  await expect.poll(() => getPosition(page)).toBeGreaterThan(0);
  await page.getByTestId("play-button").click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Rename the project and update the browser tab before saving.
  page.once("dialog", (dialog) => dialog.accept("Practice take"));
  await page.getByTestId("project-name").click();
  await expect(page.getByTestId("project-name")).toHaveText("Practice take");
  await expect(page).toHaveTitle("Practice take - Toy MIDI");

  // Load a backing track, including its decoded waveform.
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  const clip = page.getByTestId("clip-audio");
  await expect(clip).toContainText("test-audio.wav");

  // They change the session tempo.
  await page.getByTestId("tempo-input").fill("140");
  await page.getByTestId("tempo-input").press("Enter");

  // They add a reference video and mute its audio.
  await page.getByTestId("reference-video-button").click();
  const referencePanel = page.getByTestId("youtube-reference");
  await referencePanel
    .getByTestId("youtube-input")
    .fill("https://www.youtube.com/watch?v=knp40WxQgOI");
  await referencePanel.getByRole("button", { name: "Add video" }).click();
  await page.getByTestId("reference-video-mute").click();

  // They set output levels from the mixer.
  await page.getByTestId("mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  const metronomeLevel = page.getByRole("textbox", {
    name: "Metronome level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await metronomeLevel.fill("-9");
  await metronomeLevel.press("Enter");

  // The accumulated project edits are unsaved until explicitly saved.
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Reload restores the project name and browser title, tempo, and PCM-backed waveform data.
  await page.reload();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("project-name")).toHaveText("Practice take");
  await expect(page).toHaveTitle("Practice take - Toy MIDI");
  await expect(page.getByTestId("tempo-input")).toHaveValue("140");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Reference identity and mute state restore together.
  await expect(page.getByTestId("reference-track")).toBeVisible();
  await expect(page.getByTestId("reference-video-mute")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The mixer stays open across the reload, with its levels restored.
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
  await expect(
    page.getByRole("textbox", { name: "Metronome level in dB" }),
  ).toHaveValue("-9.0");

  // Reopen the saved project from the index with its name in the browser tab.
  await page.goto("/");
  const project = page.getByText("Practice take", { exact: true });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("project-name")).toHaveText("Practice take");
  await expect(page).toHaveTitle("Practice take - Toy MIDI");

  // Deleting from the index removes the project metadata and content.
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByText("Practice take", { exact: true })).toBeHidden();

  // A stale deep link reports the missing project without retrying its read.
  await page.goto(projectUrl);
  await expect(page.getByText(/Project .* not found/)).toBeVisible();
});

test("opens and resaves a project saved with a single clip per audio track and a separate recording track", async ({
  page,
}) => {
  // Seed a stored project whose audio track keeps one clip with track-level
  // timing and whose take lives on a separate recording track.
  await page.goto("/__e2e__/");
  const projectId = await page.evaluate(async () => {
    const samples = new Float32Array(22050 * 2).map(
      (_, index) => Math.sin(index / 8) * 0.5,
    );
    return window.__e2e.projectStorage.createWithContent({
      title: "Single clip",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      audioTracks: [
        {
          id: "backing",
          height: 72,
          gain: 0.5,
          muted: false,
          soloed: false,
          timelineOffset: 1,
          trimStart: 0.25,
          trimEnd: 1.5,
          clip: {
            name: "single.wav",
            gain: 0.5,
            pcm: { sampleRate: 22050, channels: [samples, samples] },
          },
        },
      ],
      recordingTrack: {
        height: 116,
        gain: 0.8,
        muted: false,
        soloed: false,
        nextTakeNumber: 4,
        takes: [
          {
            id: "take",
            number: 3,
            timelineOffset: 2,
            pcm: { sampleRate: 22050, channels: [samples] },
          },
        ],
      },
    });
  });

  // Open the stored project and show the take on the former Capture track
  // below the clip, both with decoded waveforms.
  await page.goto(`/recorder/${projectId}`);
  const rows = page.getByTestId("audio-track-row");
  const clip = rows.nth(0).getByTestId("clip-audio");
  const take = rows.nth(1).getByTestId("clip-audio");
  await expect(clip).toContainText("single.wav");
  await expect(clip.locator("svg")).toBeVisible();
  await expect(take).toContainText("Take 3");
  await expect(take.locator("svg")).toBeVisible();

  // Show the unnamed tracks with the labels they were shown with before.
  await expect(
    page.getByRole("button", { name: "Capture actions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Audio 1 actions" }),
  ).toBeVisible();

  // Rename and save the project.
  page.once("dialog", (dialog) => dialog.accept("Resaved clip"));
  await page.getByTestId("project-name").click();
  await saveProject(page);

  // Reload the resaved project and show the same clip and take.
  await page.reload();
  await expect(page.getByTestId("project-name")).toHaveText("Resaved clip");
  await expect(clip).toContainText("single.wav");
  await expect(clip.locator("svg")).toBeVisible();
  await expect(take).toContainText("Take 3");
});
