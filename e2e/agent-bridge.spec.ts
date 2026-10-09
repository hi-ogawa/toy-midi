import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { test as base, expect } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

const test = base.extend<{ bridge: AgentBridge }>({
  bridge: async ({ baseURL }, use) => {
    const port = await getFreePort();
    const server = spawn(process.execPath, [
      CLI_PATH,
      "serve",
      "--port",
      String(port),
      "--origin",
      new URL(baseURL!).origin,
    ]);
    const [listening] = await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(() => {
        throw new Error("agent bridge exited before listening");
      }),
    ]);
    expect(String(listening)).toContain("listening");
    await use({
      port,
      run: (args, stdin) => runCli([...args, "--port", String(port)], stdin),
    });
    server.kill();
  },
});

const CLI_PATH = "packages/agent-bridge/bin/cli.js";

interface AgentBridge {
  port: number;
  run: (args: string[], stdin?: string) => Promise<CliResult>;
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

test("drives the open project from the agent bridge CLI", async ({
  page,
  bridge,
}) => {
  // Open a project with the bridge enabled and wait for it to connect.
  await createRecorderProject(page);
  await page.goto(`${page.url()}?agent-bridge=${bridge.port}`);
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
  await expect
    .poll(async () => JSON.parse((await bridge.run(["pages"])).stdout))
    .toHaveLength(1);

  // List the tools the project exposes.
  const tools = await bridge.run(["tools"]);
  expect(tools.code).toBe(0);
  expect(tools.stdout).toContain("# toy_midi_eval");

  // Read the tempo through the eval tool.
  const tempo = await bridge.run([
    "call",
    "toy_midi_eval",
    "--arg",
    "code=return runtime.store.get().tempo",
  ]);
  expect(tempo).toEqual({ code: 0, stdout: "120\n", stderr: "" });

  // Pipe a multi-step edit from stdin, and see it in the editor.
  const edit = await bridge.run(
    ["call", "toy_midi_eval", "--arg", "code=-"],
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
    "call",
    "toy_midi_eval",
    "--arg",
    "code=throw new Error('boom')",
  ]);
  expect(failure.code).toBe(1);
  expect(failure.stderr).toContain("Error: boom");
});

async function runCli(args: string[], stdin?: string): Promise<CliResult> {
  const child = spawn(process.execPath, [CLI_PATH, ...args]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdin.end(stdin);
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
