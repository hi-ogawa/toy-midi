import { expect, type Locator, type Page } from "@playwright/test";

/** Create a recorder project from its index and wait for the recorder app. */
export async function createRecorderProject(page: Page): Promise<void> {
  await page.goto("/recorder");
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
}

export async function seekRecorderByPixels(page: Page, pixels: number) {
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
}

export async function dragBy(page: Page, locator: Locator, deltaX: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + deltaX,
    box!.y + box!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
}

export async function waitForRecordingSamples(recording: Locator) {
  const initialWidth = await recording.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);
}

export async function enableInput(page: Page) {
  // Fake audio still exercises permission, device discovery, and channel setup.
  const route = page.getByRole("button", {
    name: "Fake Default Audio Input · Input 1",
  });
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await route.click();
  await expect(
    page.getByRole("heading", { name: "Audio Input Setup" }),
  ).toBeVisible();
  const setup = page.getByTestId("recorder-input-setup");
  await setup.getByRole("button", { name: "Enable input" }).click();
  await expect(
    setup.getByRole("button", { name: "Disable input" }),
  ).toBeVisible();
  await expect(page.getByLabel("Device")).toContainText(
    "Fake Default Audio Input",
  );
  await expect(page.getByLabel("Channel")).toContainText("Channel 1");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", {
      name: "Fake Default Audio Input · Input 1",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}
