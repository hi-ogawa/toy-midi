import { expect } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";
import { test } from "./webmcp-bridge-helpers";

test("drives the open project from the webmcp-bridge command", async ({
  page,
  bridge,
}) => {
  // Open a project, and wait for the extension to connect its tools.
  await createRecorderProject(page);
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
});
