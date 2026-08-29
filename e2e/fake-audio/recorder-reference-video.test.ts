import { expect, test } from "@playwright/test";
import { createRecorderProject, dragBy } from "../helpers";

test("configures an ephemeral YouTube reference", async ({ page }) => {
  await createRecorderProject(page);

  // The musician opens the reference panel and resizes it around their workspace.
  const toggle = page.getByTestId("recorder-reference-video-button");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const setup = page.getByTestId("recorder-youtube-reference");
  const initialPanelBox = await setup.boundingBox();
  expect(initialPanelBox).not.toBeNull();
  await dragBy(
    page,
    setup.getByTestId("recorder-reference-video-resize-handle"),
    -80,
    -60,
  );
  const resizedPanelBox = await setup.boundingBox();
  expect(resizedPanelBox).not.toBeNull();
  expect(resizedPanelBox!.width).toBeCloseTo(initialPanelBox!.width + 80, -1);
  expect(resizedPanelBox!.height).toBeCloseTo(initialPanelBox!.height + 60, -1);
  const preview = setup.getByTestId("recorder-reference-video-preview");
  const containedPlayer = preview.locator(":scope > div");
  const containedPlayerBox = await containedPlayer.boundingBox();
  expect(containedPlayerBox).not.toBeNull();
  expect(containedPlayerBox!.width / containedPlayerBox!.height).toBeCloseTo(
    16 / 9,
    2,
  );

  // Invalid input stays editable before a valid YouTube URL creates the player.
  await setup.getByTestId("recorder-youtube-input").fill("not a video");
  await setup.getByRole("button", { name: "Add video" }).click();
  await expect(setup).toContainText("Enter a valid YouTube URL or video ID.");

  await setup
    .getByTestId("recorder-youtube-input")
    .fill("https://www.youtube.com/watch?v=knp40WxQgOI");
  await setup.getByRole("button", { name: "Add video" }).click();

  // The panel shows an immediate thumbnail while YouTube initializes underneath.
  const reference = setup;
  await expect(
    reference
      .getByTestId("recorder-reference-video-placeholder")
      .locator("img"),
  ).toHaveAttribute(
    "src",
    /i\.ytimg\.com\/vi\/knp40WxQgOI\/(?:maxres|hq)default\.jpg/,
  );
  await expect(reference.locator("iframe")).toHaveAttribute(
    "src",
    /youtube(?:-nocookie)?\.com\/embed\/knp40WxQgOI/,
  );

  // Reference audio can be muted independently from the recorder transport.
  const mute = page.getByTestId("recorder-reference-video-mute");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");

  // The configured video appears as a timeline clip that can be aligned by dragging.
  const referenceTrack = page.getByTestId("recorder-reference-track");
  await expect(referenceTrack).toContainText("Reference");
  await expect(referenceTrack).toContainText("0:00");
  await expect(referenceTrack).toContainText("3:32");
  await expect(
    referenceTrack.getByTestId("recorder-clip-reference"),
  ).toContainText("YouTube reference");
  const referenceClip = referenceTrack.getByTestId("recorder-clip-reference");
  await dragBy(page, referenceClip, 80, 0, "start");
  await expect(referenceClip).toContainText(/\+\d+\.\d{3}s/);

  // The reference can be opened at its source or removed from its track actions.
  const openOnYouTube = reference.getByRole("link", {
    name: "Open on YouTube",
  });
  await expect(openOnYouTube).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=knp40WxQgOI",
  );
  await page.getByRole("button", { name: "Reference actions" }).click();
  await page.getByRole("menuitem", { name: "Remove reference video" }).click();
  await expect(reference.locator("iframe")).toHaveCount(0);
  await expect(referenceTrack).toHaveCount(0);

  // Closing the panel releases the header toggle.
  await reference
    .getByRole("button", { name: "Close Reference Video" })
    .click();
  await expect(reference).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
