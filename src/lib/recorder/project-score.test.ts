import { describe, expect, it, vi } from "vitest";
import { TAB_STRING_PRESETS } from "../tab-annotation";
import type { SerializedRecorderRuntimeState } from "./persistence";
import { getRecorderProjectScoreSource } from "./project-score";
import { recorderProjectStorage } from "./project-storage";

vi.mock("./project-storage", () => ({
  recorderProjectStorage: { load: vi.fn() },
}));

describe(getRecorderProjectScoreSource, () => {
  it("exports the chosen track with project timing and notation settings", async () => {
    const project = makeProject();
    const track = project.midiTracks![0];
    project.midiTracks!.unshift({ ...track, id: "other", notes: [] });
    vi.mocked(recorderProjectStorage.load).mockResolvedValue(project);

    const source = await getRecorderProjectScoreSource({
      projectId: "project",
      trackId: "bass",
    });
    expect(source.name).toBe("Song · Bass.musicxml");
    expect(source.xml).toContain("<work-title>Song</work-title>");
    expect(source.xml).toContain('<sound tempo="90"');
    expect(source.xml).toContain("<beats>3</beats>");
    expect(source.xml).toContain("<fifths>1</fifths>");
    expect(source.xml).toContain("<staff-lines>4</staff-lines>");
    expect(source.xml).toContain("Verse");
    expect(source.xml).toContain("<pitch>");
    expect(source.xml).not.toContain('<measure number="2">');
  });

  it("supports projects saved before notation settings and locators", async () => {
    const project = makeProject();
    delete project.locators;
    delete project.midiTracks![0].keySignature;
    delete project.midiTracks![0].tabOpenStringPitches;
    vi.mocked(recorderProjectStorage.load).mockResolvedValue(project);
    const source = await getRecorderProjectScoreSource({
      projectId: "project",
      trackId: "bass",
    });
    expect(source.xml).toContain("<fifths>0</fifths>");
    expect(source.xml).toContain("<staff-lines>5</staff-lines>");
  });

  it("rejects a missing track", async () => {
    vi.mocked(recorderProjectStorage.load).mockResolvedValue(makeProject());
    await expect(
      getRecorderProjectScoreSource({
        projectId: "project",
        trackId: "missing",
      }),
    ).rejects.toThrow("MIDI track missing not found");
  });
});

function makeProject(): SerializedRecorderRuntimeState {
  return {
    title: "Song",
    tempo: 90,
    timeSignature: { numerator: 3, denominator: 4 },
    locators: [{ id: "verse", beat: 3, label: "Verse" }],
    audioTracks: [],
    recordingTrack: {
      height: 100,
      gain: 1,
      muted: false,
      soloed: false,
      takes: [],
    },
    latencyCompensation: 0,
    midiTracks: [
      {
        id: "bass",
        name: "Bass",
        program: 33,
        notes: [
          { id: "note", start: 3, duration: 1, pitch: 33, velocity: 100 },
        ],
        eq: { bypass: false, bands: [] },
        height: 100,
        gain: 1,
        muted: false,
        soloed: false,
        keySignature: { fifths: 1, mode: "major" },
        tabOpenStringPitches: [...TAB_STRING_PRESETS[0].openStringPitches],
      },
    ],
  };
}
