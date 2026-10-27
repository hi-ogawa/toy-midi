import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { SharedProject } from "../src/lib/project-share";
import { getMenuItem, selectMenuItem } from "./helpers";

const PROJECT: SharedProject = {
  title: "Synth",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  midiTracks: [
    {
      name: "Lead",
      program: 80,
      synth: { waveform: "sine" },
      notes: [],
      viewMode: "editor",
    },
    { name: "Piano", program: 0, notes: [], viewMode: "editor" },
  ],
};

test("changes a synth track's waveform in its Synth panel", async ({
  page,
}) => {
  // Open a draft with a synth track and a SoundFont track.
  const payload = deflateRawSync(JSON.stringify(PROJECT)).toString("base64url");
  await page.goto(`/draft#p=${payload}`);
  await expect(page.getByTestId("draft-badge")).toBeVisible();

  // See that only the synth track offers a Synth panel.
  await expect(
    await getMenuItem(page, { menu: "Piano actions", item: "Effects…" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Synth…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Open the synth track's panel, and see the patch's default sine selected.
  await selectMenuItem(page, { menu: "Lead actions", item: "Synth…" });
  const panel = page.getByTestId("synth-panel");
  await expect(
    panel.getByRole("heading", { name: "Lead Synth" }),
  ).toBeVisible();
  const waveform = panel.getByRole("group", { name: "Waveform" });
  await expect(waveform.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Switch to sawtooth, and see the panel follow the track's patch.
  await waveform.getByRole("button", { name: "Saw" }).click();
  await expect(waveform.getByRole("button", { name: "Saw" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(waveform.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
