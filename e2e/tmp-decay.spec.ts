import { expect, test } from "@playwright/test";
import { addMidiTrack, createProject } from "./editor-helpers";
import { installFakeMidiDevice, tapMasterOutput } from "./helpers";
test.use({ permissions: ["midi"] });
test("decay", async ({ page }) => {
  test.setTimeout(55000);
  const device = await installFakeMidiDevice(page);
  await createProject(page);
  const first = await addMidiTrack(page);
  await addMidiTrack(page);
  const monitor = first.getByTestId("input-monitor");
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Device" }).click();
  const dialog = page.getByRole("dialog", { name: "MIDI Device" });
  await dialog.getByLabel("Device").selectOption("Fake Keyboard");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(monitor).toBeVisible();
  const output = await tapMasterOutput(page);
  const peak = await page.evaluateHandle(() => {
    const { masterOutput } = window.toyMidi.runtime!;
    const analyser = masterOutput.context.createAnalyser();
    masterOutput.connect(analyser);
    return analyser;
  });
  await monitor.click();
  await expect(monitor).toHaveAttribute("aria-pressed", "true");
  await device.send({ type: "note-on", pitch: 60, velocity: 100 });
  const start = Date.now();
  await output.expectSound();
  const out: string[] = [`sound after ${Date.now() - start}ms`];
  while (Date.now() - start < 30000) {
    const p = await peak.evaluate((a) => {
      const s = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(s);
      return Math.max(...s.map(Math.abs));
    });
    out.push(`${((Date.now() - start) / 1000).toFixed(1)}s ${p.toFixed(5)}`);
    await page.waitForTimeout(1500);
  }
  console.log(out.join("\n"));
});
