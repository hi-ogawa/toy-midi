import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { getMidiNote } from "./editor-helpers";

test("serves the agent guide, and its example opens as a share link", async ({
  page,
  request,
}) => {
  // Fetch the site as an agent would, and find the guide linked from the HTML.
  const html = await (await request.get("/")).text();
  expect(html).toContain('href="/llms.txt"');

  // Follow the home page's link to the guide.
  await page.goto("/");
  await page.getByRole("link", { name: "For Agents" }).click();
  await expect(page).toHaveURL(/\/llms\.txt$/);
  await expect(page.locator("body")).toContainText("# Toy MIDI");

  // Fetch the declaration files the guide links to.
  const runtime = await request.get("/llms/runtime.d.ts");
  expect(await runtime.text()).toContain("declare class EditorRuntime");
  const project = await request.get("/llms/project.d.ts");
  expect(await project.text()).toContain(
    "interface SerializedEditorRuntimeState",
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
