import path from "node:path";
import { expect, Page, test } from "@playwright/test";

test("navigates between projects and the score viewer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("score-viewer-link").click();
  await expect(page).toHaveURL(/\/score-viewer$/);

  await page.getByRole("button", { name: "More" }).click();
  await page.getByTestId("all-projects-menu-item").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("startup-screen")).toBeVisible();
});

test("renders and plays a Toy MIDI MusicXML export", async ({ page }) => {
  await page.goto("/score-viewer");
  await page
    .getByLabel("Upload MusicXML")
    .setInputFiles(
      path.resolve("src/lib/__snapshots__/five-string-tab.musicxml"),
    );

  await expect(page.getByText("five-string-tab.musicxml")).toBeVisible();
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  await expect(page.getByLabel("BPM")).toHaveValue("120");
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("BPM").press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("loads and advances the cursor sample", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Cursor and wrapping");

  const playButton = page.getByRole("button", { name: "Play" });
  await expect(playButton).toBeEnabled();
  const cursor = page.getByTestId("score-viewer-cursor");
  const position = page.getByText("01|01");
  const seekButton = page.getByRole("button", { name: "Seek" });
  await expect(cursor).toBeVisible();
  await expect(position).toBeVisible();
  const initialTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );

  await playButton.click();
  await page.waitForTimeout(100);
  const firstTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  await page.waitForTimeout(100);
  const secondTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(secondTransform).not.toBe(firstTransform);
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .not.toBe(initialTransform);

  await page.getByRole("button", { name: "Pause" }).click();
  page.once("dialog", (dialog) => dialog.accept("2:3"));
  await seekButton.click();
  await expect(page.getByText("02|03")).toBeVisible();
  const seekTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(seekTransform).not.toBe(initialTransform);

  await page.getByLabel("BPM").fill("120");
  await page.getByLabel("BPM").press("Enter");
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(100);
  const fastTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(fastTransform).not.toBe(seekTransform);

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByLabel("BPM").fill("60");
  await page.getByLabel("BPM").press("Enter");
  page.once("dialog", (dialog) => dialog.accept("3|4"));
  await seekButton.click();
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(100);
  const systemEndStart = await cursor.evaluate(
    (element) => element.style.transform,
  );
  await page.waitForTimeout(200);
  const systemEndLater = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(systemEndLater).not.toBe(systemEndStart);
  await expect(cursor).toHaveAttribute("data-system-id", "0");
  await expect.poll(() => cursor.getAttribute("data-system-id")).toBe("1");
});

test("uses MusicXML time signatures for seeking", async ({ page }) => {
  await page.goto("/score-viewer");
  await page.getByLabel("Upload MusicXML").setInputFiles({
    name: "mixed-meter.musicxml",
    mimeType: "application/vnd.recordare.musicxml+xml",
    buffer: Buffer.from(mixedMeterMusicXml),
  });

  const seekButton = page.getByRole("button", { name: "Seek" });
  page.once("dialog", (dialog) => dialog.accept("2:4"));
  await seekButton.click();
  await expect(page.getByText("02|04")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept("2:8"));
  await seekButton.click();
  await expect(page.getByText("02|06")).toBeVisible();
});

test("switches between generated score samples", async ({ page }) => {
  await page.goto("/score-viewer");

  await loadSample(page, "Dense sixteenths");
  await expect(page.getByTestId("score-name")).toHaveText("Dense sixteenths");
  await expect(page.getByLabel("BPM")).toHaveValue("110");
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  await loadSample(page, "Fast eighths");
  await expect(page.getByTestId("score-name")).toHaveText("Fast eighths");
  await expect(page.getByLabel("BPM")).toHaveValue("200");
});

test("switches score layout", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Long score");

  const renderer = page.getByTestId("score-viewer-renderer");
  await page.getByLabel("Layout").selectOption("paged");
  await expect(page.getByLabel("Layout")).toHaveValue("paged");
  await expect.poll(() => renderer.locator("svg").count()).toBeGreaterThan(1);

  await page.getByLabel("Layout").selectOption("continuous");
  await expect(page.getByLabel("Layout")).toHaveValue("continuous");
});

async function loadSample(page: Page, name: string) {
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
}

const mixedMeterMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>6</duration><type>half</type><dot/></note>
    </measure>
    <measure number="2">
      <attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
      <note><rest/><duration>6</duration><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
