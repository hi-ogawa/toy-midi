import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { getMidiNote } from "./editor-helpers";

test("opens the agent guide's example project as a share link", async ({
  page,
}) => {
  // Find the guide linked from the home page.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "For Agents" })).toHaveAttribute(
    "href",
    /docs\/llms\.md$/,
  );

  // Encode the guide's example project the way the guide says, and open it.
  const guide = readFileSync("docs/llms.md", "utf8");
  const example = guide.match(/```json\n([\s\S]*?)```/)![1];
  const payload = deflateRawSync(JSON.stringify(JSON.parse(example))).toString(
    "base64url",
  );
  await page.goto(`/draft#p=${payload}`);
  await expect(page.getByTestId("draft-badge")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveText("Two notes");
  await expect(page.getByTestId("tempo-input")).toHaveValue("98");
  const track = page.getByTestId("midi-track-row");
  await expect(track).toContainText("Bass");
  await expect(getMidiNote(track, { beat: 0, pitch: "A1" })).toBeVisible();
  await expect(getMidiNote(track, { beat: 1, pitch: "E2" })).toBeVisible();
});
