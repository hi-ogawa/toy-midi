import { expect, type Locator, type Page, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("reorders tracks from their row menus", async ({ page }) => {
  // Create a project, then add a MIDI track and an empty audio track.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  await page.getByRole("button", { name: "Add empty audio track" }).click();
  await expectTrackRows(page, ["Capture", "MIDI 1", "Audio 1"]);

  // Add a reference video, which inserts its row first.
  await page.getByTestId("recorder-reference-video-button").click();
  const referencePanel = page.getByTestId("recorder-youtube-reference");
  await referencePanel
    .getByTestId("recorder-youtube-input")
    .fill("https://www.youtube.com/watch?v=knp40WxQgOI");
  await referencePanel.getByRole("button", { name: "Add video" }).click();

  // The first row cannot move up. Opening its menu also waits for YouTube to
  // load the video, which took up to 8.5s in parallel runs.
  await page.getByRole("button", { name: "Reference actions" }).click();
  await expect(
    page
      .getByRole("menu", { name: "Reference actions" })
      .getByRole("menuitem", { name: "Move up" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expectTrackRows(page, ["Reference", "Capture", "MIDI 1", "Audio 1"]);

  // The last row cannot move down.
  await page.getByRole("button", { name: "Audio 1 actions" }).click();
  await expect(
    page
      .getByRole("menu", { name: "Audio 1 actions" })
      .getByRole("menuitem", { name: "Move down" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  // Move Audio 1 above MIDI 1 and the reference below Capture.
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Move up" });
  await selectMenuItem(page, { menu: "Reference actions", item: "Move down" });
  await expectTrackRows(page, ["Capture", "Reference", "Audio 1", "MIDI 1"]);

  // Mixer channels follow the track order and leave out the reference video.
  await page.getByTestId("recorder-mixer-button").click();
  await expectMixerChannels(page, [
    "Master",
    "Capture",
    "Audio 1",
    "MIDI 1",
    "Metronome",
  ]);

  // Save and reload to restore the order.
  await saveRecorderProject(page);
  await page.reload();
  await expectTrackRows(page, ["Capture", "Reference", "Audio 1", "MIDI 1"]);

  // Remove the reference video, then undo to restore it at its position.
  await selectMenuItem(page, {
    menu: "Reference actions",
    item: "Remove reference video",
  });
  await expectTrackRows(page, ["Capture", "Audio 1", "MIDI 1"]);
  await page.keyboard.press("ControlOrMeta+Z");
  await expectTrackRows(page, ["Capture", "Reference", "Audio 1", "MIDI 1"]);

  // Remove MIDI 1 after moving it first, then undo to restore it first.
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Move up" });
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Move up" });
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Move up" });
  await expectTrackRows(page, ["MIDI 1", "Capture", "Reference", "Audio 1"]);
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Remove track" });
  await expectTrackRows(page, ["Capture", "Reference", "Audio 1"]);
  await page.keyboard.press("ControlOrMeta+Z");
  await expectTrackRows(page, ["MIDI 1", "Capture", "Reference", "Audio 1"]);
});

test("orders tracks of projects saved before track reordering", async ({
  page,
}) => {
  // Seed a project saved before track reordering, with the Capture track
  // stored separately and the reference video saved last.
  await page.goto("/__e2e__/");
  const projectId = await page.evaluate(async () => {
    const samples = new Float32Array(22050).fill(0.25);
    return window.__e2e.recorderProjectStorage.createWithContent({
      title: "Before reordering",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      audioTracks: [
        {
          id: "backing",
          height: 72,
          gain: 1,
          muted: false,
          soloed: false,
          clips: [
            {
              timelineOffset: 0,
              pcm: { sampleRate: 22050, channels: [samples] },
            },
          ],
        },
      ],
      recordingTrack: {
        height: 72,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [],
      },
      midiTracks: [
        {
          id: "midi",
          name: "MIDI 1",
          notes: [],
          program: 0,
          eq: { bypass: true, bands: [] },
          height: 300,
          gain: 1,
          muted: false,
          soloed: false,
        },
      ],
      referenceVideo: {
        videoId: "knp40WxQgOI",
        timelineStart: 0,
        muted: false,
        duration: 60,
      },
    });
  });

  // Open it to show the reference video first, then audio tracks with
  // Capture first among them, then MIDI tracks.
  await page.goto(`/recorder/${projectId}`);
  await expectTrackRows(page, ["Reference", "Capture", "Audio 1", "MIDI 1"]);
});

async function expectTrackRows(page: Page, labels: string[]): Promise<void> {
  const menus = page
    .getByTestId("recorder-track-scroll")
    .getByRole("button", { name: / actions$/ });
  await expect
    .poll(() => getAriaLabels(menus))
    .toEqual(labels.map((label) => `${label} actions`));
}

async function expectMixerChannels(
  page: Page,
  labels: string[],
): Promise<void> {
  const sliders = page.getByTestId("recorder-mixer-panel").getByRole("slider");
  await expect
    .poll(() => getAriaLabels(sliders))
    .toEqual(labels.map((label) => `${label} gain`));
}

function getAriaLabels(locator: Locator): Promise<(string | null)[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
}
