import { expect } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";
import { extensionTest, test } from "./webmcp-bridge-helpers";

extensionTest(
  "drives the open project from the webmcp-bridge command",
  async ({ page, bridge, toggleTab }) => {
    // Open a project, and see that it does not connect before the tab opts in.
    await createRecorderProject(page);
    expect(JSON.parse((await bridge.run(["pages"])).stdout)).toEqual([]);

    // Opt the tab in from the extension, and wait for it to connect.
    await toggleTab(page);
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toHaveLength(1);

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
    const [before] = JSON.parse((await bridge.run(["pages"])).stdout);
    await page.reload();
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toEqual([expect.not.objectContaining({ id: before.id })]);

    // Opt the tab out, and see it disconnect.
    await toggleTab(page);
    await expect
      .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
      .toEqual([]);
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
