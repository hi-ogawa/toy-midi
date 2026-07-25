import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

test.describe("Project Route", () => {
  test("deep link opens project directly without startup screen", async ({
    page,
  }) => {
    // Create a project with recognizable state
    await page.goto("/");
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-deep-link",
        pitch: 62,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().setTempo(140);
    });
    await page.evaluate(() => window.__e2e!.flushAutoSave());

    const projectId = await page.evaluate(() =>
      window.__e2e!.projectStorage.getLastProjectId(),
    );
    expect(projectId).not.toBeNull();

    // Open via URL directly
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).not.toBeVisible();

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(62);
    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(140);
  });

  test("editor renders notes before audio is ready", async ({ page }) => {
    // Hold soundfont requests behind a gate so audio init cannot finish
    // until we release it. Installed before any navigation so the preload
    // on the startup page doesn't warm the browser cache past the route.
    let releaseSoundfont = () => {};
    const soundfontGate = new Promise<void>((resolve) => {
      releaseSoundfont = resolve;
    });
    await page.route("**/*.sf2", async (route) => {
      await soundfontGate;
      // Requests aborted by navigation are already handled; ignore those
      await route.continue().catch(() => {});
    });

    // Create a project with a note
    await page.goto("/");
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-audio-loading",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
    });
    await page.evaluate(() => window.__e2e!.flushAutoSave());
    const projectId = await page.evaluate(() =>
      window.__e2e!.projectStorage.getLastProjectId(),
    );

    // The editor mounts with content while audio is still initializing
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page.getByTestId("note-note-audio-loading")).toBeVisible();
    await expect(page.getByTestId("play-pause-button")).toBeDisabled();

    // Space is a no-op while audio is loading
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play-icon")).toBeVisible();

    // Release the soundfont; playback becomes available
    releaseSoundfont();
    await expect(page.getByTestId("play-pause-button")).toBeEnabled();
  });

  test("unknown project id shows error", async ({ page }) => {
    await page.goto("/project/does-not-exist");
    await expect(
      page.getByText("Project does-not-exist metadata not found"),
    ).toBeVisible();
  });
});
