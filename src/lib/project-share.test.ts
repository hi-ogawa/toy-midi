import { inflateRawSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import type { SerializedEditorRuntimeState } from "./persistence";
import {
  createShareLink,
  decodeSharedProject,
  getSharePayload,
} from "./project-share";

afterEach(() => vi.unstubAllGlobals());

it("shares a project without ids and opens it with fresh ones", async () => {
  vi.stubGlobal("window", { location: { origin: "https://example.com" } });
  const project = createProject();

  const payload = getSharePayload(await createShareLink(project))!;
  const shared = JSON.parse(
    inflateRawSync(Buffer.from(payload, "base64url")).toString(),
  );
  expect(JSON.stringify(shared)).not.toContain('"id"');
  expect(shared).not.toHaveProperty("audioTracks");
  expect(shared).not.toHaveProperty("trackOrder");

  const opened = await decodeSharedProject(payload);
  const anyId = expect.any(String);
  expect(opened).toEqual({
    ...project,
    audioTracks: [],
    trackOrder: undefined,
    locators: [{ ...project.locators![0], id: anyId }],
    midiTracks: project.midiTracks!.map((track) => ({
      ...track,
      id: anyId,
      notes: track.notes.map((note) => ({ ...note, id: anyId })),
      eq: {
        ...track.eq,
        bands: track.eq.bands.map((band) => ({ ...band, id: anyId })),
      },
    })),
  });
  const ids = [
    ...opened.midiTracks!.map((track) => track.id),
    ...opened.midiTracks!.flatMap((track) => track.notes.map((n) => n.id)),
  ];
  expect(new Set(ids).size).toBe(ids.length);
});

function createProject(): SerializedEditorRuntimeState {
  const createTrack = (id: string, pitch: number) => ({
    id,
    name: `Track ${id}`,
    program: 0,
    eq: {
      bypass: false,
      bands: [
        { id: `${id}-eq`, frequency: 1000, gain: 1, q: 1, bypass: false },
      ],
    },
    height: 120,
    viewMode: "editor" as const,
    gain: 1,
    pan: 0,
    muted: false,
    soloed: false,
    notes: [
      { id: `${id}-n1`, pitch, start: 0, duration: 1, velocity: 100 },
      {
        id: `${id}-n2`,
        pitch: pitch + 4,
        start: 1,
        duration: 0.5,
        velocity: 80,
      },
    ],
  });
  return {
    title: "Song",
    locators: [{ id: "l1", beat: 4, label: "Chorus" }],
    audioTracks: [
      {
        id: "a1",
        height: 120,
        gain: 1,
        muted: false,
        soloed: false,
        clips: [],
      },
    ],
    midiTracks: [createTrack("t1", 60), createTrack("t2", 48)],
    trackOrder: ["a1", "t2", "t1"],
    tempo: 90,
    timeSignature: { numerator: 3, denominator: 4 },
  };
}
