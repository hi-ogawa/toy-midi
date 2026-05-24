// @vitest-environment happy-dom

import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { describe, expect, it } from "vitest";
import { Note } from "../types";
import { exportMusicXML } from "./musicxml-export";

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    measureText: (text: string) => ({ width: text.length * 8 }),
  }),
});

describe("MusicXML export integration", () => {
  it("loads generated MusicXML in OpenSheetMusicDisplay", async () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 64,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-3",
        pitch: 55,
        start: 3,
        duration: 2,
        velocity: 100,
      },
    ];
    const xml = exportMusicXML({
      notes,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      title: "OSMD Smoke",
      partName: "Bass",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false,
      backend: "svg",
      drawTitle: false,
    });

    await expect(osmd.load(xml)).resolves.toBeDefined();

    container.remove();
  });
});
