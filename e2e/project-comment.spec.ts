import { expect, test } from "@playwright/test";
import { createProject, saveProject } from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("keeps the project comment with the project", async ({ page }) => {
  // Open the comment panel, and write a chord chart in Markdown.
  await createProject(page);
  await selectMenuItem(page, { menu: "Editor menu", item: "Project Comment" });
  const comment = page.getByTestId("project-comment-input");
  await comment.fill(
    "## Chords\n\n| Bar 1 | Bar 2 |\n| --- | --- |\n| Dm7 | G7 |",
  );

  // Type a space in the comment, and see it stay text instead of starting playback.
  await comment.press("End");
  await comment.press("Space");
  await expect(comment).toHaveValue(
    "## Chords\n\n| Bar 1 | Bar 2 |\n| --- | --- |\n| Dm7 | G7 | ",
  );
  await expect(page.getByTestId("play-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Turn on Preview, and see the heading and table rendered.
  const panel = page.getByTestId("project-comment-panel");
  await panel.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByTestId("project-comment-preview");
  await expect(preview.getByRole("heading", { name: "Chords" })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "Dm7" })).toBeVisible();

  // Save and reload, and see the panel reopen in preview.
  await saveProject(page);
  await page.reload();
  await expect(preview.getByRole("heading", { name: "Chords" })).toBeVisible();

  // Turn off Preview, and see the comment's Markdown source to edit.
  await panel.getByRole("button", { name: "Preview" }).click();
  await expect(comment).toHaveValue(
    "## Chords\n\n| Bar 1 | Bar 2 |\n| --- | --- |\n| Dm7 | G7 | ",
  );
});
