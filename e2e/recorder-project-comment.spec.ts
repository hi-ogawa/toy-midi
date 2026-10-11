import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";
import { createRecorderProject, saveRecorderProject } from "./recorder-helpers";

test("keeps the project comment with the project", async ({ page }) => {
  // Open the comment panel, and write a chord chart into it.
  await createRecorderProject(page);
  await selectMenuItem(page, { menu: "Editor menu", item: "Project Comment" });
  const comment = page.getByTestId("recorder-project-comment-input");
  await comment.fill("## Chords\n| Dm7 | G7 |");

  // Type a space in the comment, and see it stay text instead of starting playback.
  await comment.press("End");
  await comment.press("Space");
  await expect(comment).toHaveValue("## Chords\n| Dm7 | G7 | ");
  await expect(page.getByTestId("recorder-play-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Save and reload, and see the panel reopen with the comment.
  await saveRecorderProject(page);
  await page.reload();
  await expect(page.getByTestId("recorder-project-comment-input")).toHaveValue(
    "## Chords\n| Dm7 | G7 | ",
  );
});
