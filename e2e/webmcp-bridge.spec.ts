import { expect } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";
import { extensionTest, test } from "./webmcp-bridge-helpers";

extensionTest(
  "drives the open project from the webmcp-bridge command",
  async ({ page, bridge, extension }) => {
    // Open a project, and see that it does not connect before the tab opts in.
    await createRecorderProject(page);
    expect(JSON.parse((await bridge.run(["pages"])).stdout)).toEqual([]);

    // Opt the tab in from the extension, and see it connect and the badge say so.
    await extension.toggleTab(page);
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toHaveLength(1);
    await expect.poll(() => extension.getBadgeText(page)).toBe("ON");

    // List the tools the project exposes.
    const tools = await bridge.run(["get-tools"]);
    expect(tools.code).toBe(0);
    expect(tools.stdout).toContain("# toy_midi_eval");

    // Read the tempo through the eval tool.
    const tempo = await bridge.run([
      "execute-tool",
      "toy_midi_eval",
      "--arg",
      "code=return runtime.store.get().tempo",
    ]);
    expect(tempo).toEqual({ code: 0, stdout: "120\n", stderr: "" });

    // Pipe a multi-step edit from stdin, and see it in the editor.
    const edit = await bridge.run(
      ["execute-tool", "toy_midi_eval", "--arg", "code=-"],
      `
      runtime.setTempo(98);
      await runtime.addMidiTrack({ program: 33 });
      const id = runtime.store.get().midiTracks.at(-1).id;
      runtime.setMidiTrackNotes(id, [
        { id: crypto.randomUUID(), pitch: 33, start: 0, duration: 1, velocity: 100 },
      ]);
    `,
    );
    expect(edit).toEqual({ code: 0, stdout: "", stderr: "" });
    await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("98");
    await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(1);

    // Throw from the agent's code, and get the error back with a failing exit code.
    const failure = await bridge.run([
      "execute-tool",
      "toy_midi_eval",
      "--arg",
      "code=throw new Error('boom')",
    ]);
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain("Error: boom");

    // Reload the page, and see the opted-in tab connect again.
    const reloadedAt = new Date().toISOString();
    await page.reload();
    await expect
      .poll(async () => {
        const pages = JSON.parse((await bridge.run(["pages"])).stdout);
        return pages.length === 1 && pages[0].connectedAt > reloadedAt;
      })
      .toBe(true);

    // Opt the tab out, and see it disconnect and the badge clear.
    await extension.toggleTab(page);
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toEqual([]);
    await expect.poll(() => extension.getBadgeText(page)).toBe("");
  },
);

extensionTest(
  "connects a tab opened before its site was allowed",
  async ({ page, bridge, extension }) => {
    // Open a project before allowing its site, so the tab has no content script.
    await extension.openBeforeSiteAllowed(() => createRecorderProject(page));

    // Turn the tab on, and see it connect and the badge say so.
    await extension.toggleTab(page);
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toHaveLength(1);
    await expect.poll(() => extension.getBadgeText(page)).toBe("ON");
  },
);

test("connects the open project to the bridge from the URL parameter", async ({
  page,
  bridge,
}) => {
  // Open a project with `?webmcp-bridge` in a browser without the extension,
  // so the page connects by itself.
  await createRecorderProject(page);
  await page.goto(`${page.url()}?webmcp-bridge=${bridge.port}`);
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
  await expect
    .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
    .toHaveLength(1);

  // Read the tempo through the eval tool.
  const tempo = await bridge.run([
    "execute-tool",
    "toy_midi_eval",
    "--arg",
    "code=return runtime.store.get().tempo",
  ]);
  expect(tempo).toEqual({ code: 0, stdout: "120\n", stderr: "" });
});

test.describe(() => {
  test.use({ allowAppOrigin: false });

  test("connects the open project after its site is allowed", async ({
    page,
    bridge,
    baseURL,
  }) => {
    // Open a project with the bridge enabled, and see the bridge refuse it.
    await createRecorderProject(page);
    await page.goto(`${page.url()}?webmcp-bridge=${bridge.port}`);
    await expect(page.getByTestId("recorder-project-name")).toBeVisible();
    expect(JSON.parse((await bridge.run(["pages"])).stdout)).toEqual([]);

    // Allow the site while the bridge runs, reload, and see the page connect.
    const origin = new URL(baseURL!).origin;
    const allow = await bridge.run(["allow", origin]);
    expect(allow.code).toBe(0);
    await page.reload();
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toMatchObject([{ origin }]);
  });
});

extensionTest.describe(() => {
  extensionTest.use({ allowAppOrigin: false });

  extensionTest(
    "retries a refused tab once its site is allowed",
    async ({ page, bridge, baseURL, extension }) => {
      // Open a project, turn the tab on, and see the bridge refuse it.
      await createRecorderProject(page);
      await extension.toggleTab(page);
      await expect.poll(() => extension.getBadgeText(page)).toBe("!");

      // Allow the site while the bridge runs, click again, and see the tab connect.
      const origin = new URL(baseURL!).origin;
      const allow = await bridge.run(["allow", origin]);
      expect(allow.code).toBe(0);
      await extension.toggleTab(page);
      await expect.poll(() => extension.getBadgeText(page)).toBe("ON");
      await expect
        .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
        .toMatchObject([{ origin }]);
    },
  );
});
