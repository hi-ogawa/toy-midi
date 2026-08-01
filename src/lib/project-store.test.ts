import { beforeEach, describe, expect, it } from "vitest";
import type { Note } from "../types";
import { historyStore } from "./history-store";
import {
  type AudioTrack,
  createDefaultSavedProject,
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "./project-store";
import { TAB_OPEN_STRING_PRESETS } from "./tab-annotation";

function makeAudioTrack(id: string, offset: number): AudioTrack {
  return {
    id,
    fileName: `${id}.wav`,
    assetKey: `asset-${id}`,
    duration: 10,
    offset,
    volume: 1,
    muted: false,
    waveformHeight: 60,
    audioWaveform: { status: "pending" },
  };
}

function getOffsets(): number[] {
  return useProjectStore.getState().audioTracks.map((t) => t.offset);
}

function makeNote(
  id: string,
  pitch: number,
  tabString?: Note["tabString"],
): Note {
  return { id, pitch, start: 0, duration: 1, velocity: 100, tabString };
}

describe("moveAudioOffset", () => {
  beforeEach(() => {
    useProjectStore.setState({
      audioTracks: [makeAudioTrack("audio-1", 5), makeAudioTrack("audio-2", 2)],
      linkAudioOffsetsEnabled: true,
    });
  });

  it("moves all tracks by the same delta when linked", () => {
    useProjectStore.getState().moveAudioOffset("audio-1", 7);
    expect(getOffsets()).toEqual([7, 4]);
  });

  it("clamps the shared delta so the minimum offset lands at 0", () => {
    // Requested delta is -5 but audio-2 can only move -2
    useProjectStore.getState().moveAudioOffset("audio-1", 0);
    expect(getOffsets()).toEqual([3, 0]);
  });

  it("preserves relative offsets when dragging the min-offset track to 0", () => {
    useProjectStore.getState().moveAudioOffset("audio-2", 0);
    expect(getOffsets()).toEqual([3, 0]);
  });

  it("moves only the dragged track when linking is disabled", () => {
    useProjectStore.setState({ linkAudioOffsetsEnabled: false });
    useProjectStore.getState().moveAudioOffset("audio-1", 7);
    expect(getOffsets()).toEqual([7, 2]);
  });

  it("clamps a single track at 0 when linking is disabled", () => {
    useProjectStore.setState({ linkAudioOffsetsEnabled: false });
    useProjectStore.getState().moveAudioOffset("audio-1", -3);
    expect(getOffsets()).toEqual([0, 2]);
  });

  it("ignores unknown track ids", () => {
    useProjectStore.getState().moveAudioOffset("audio-99", 7);
    expect(getOffsets()).toEqual([5, 2]);
  });
});

describe("master volume persistence", () => {
  it("serializes the master volume", () => {
    useProjectStore.setState({ masterVolume: 0.75 });

    expect(toSavedProject(useProjectStore.getState()).masterVolume).toBe(0.75);
  });

  it("defaults old projects to unity gain", () => {
    const project = createDefaultSavedProject();
    delete project.masterVolume;

    expect(fromSavedProject(project).masterVolume).toBe(1);
  });
});

describe("tab annotation settings persistence", () => {
  it("uses compatible defaults", () => {
    const project = createDefaultSavedProject();
    delete project.tabAnnotationEnabled;
    delete project.tabOpenStringPitches;

    expect(fromSavedProject(project)).toMatchObject({
      tabAnnotationEnabled: false,
      tabOpenStringPitches: TAB_OPEN_STRING_PRESETS.fourString,
    });
  });

  it("round-trips project settings and note overrides", () => {
    useProjectStore.setState({
      notes: [makeNote("note-1", 48, 3)],
      tabAnnotationEnabled: true,
      tabOpenStringPitches: [...TAB_OPEN_STRING_PRESETS.fiveString],
    });

    const saved = toSavedProject(useProjectStore.getState());
    expect(fromSavedProject(saved)).toMatchObject({
      notes: [expect.objectContaining({ id: "note-1", tabString: 3 })],
      tabAnnotationEnabled: true,
      tabOpenStringPitches: TAB_OPEN_STRING_PRESETS.fiveString,
    });
  });
});

describe("tab annotation note actions", () => {
  beforeEach(() => {
    historyStore.clearHistory();
    useProjectStore.setState({
      notes: [makeNote("high", 48), makeNote("low", 30)],
      selectedNoteIds: new Set(["high", "low"]),
      tabOpenStringPitches: [...TAB_OPEN_STRING_PRESETS.fourString],
    });
  });

  it("assigns an absolute playable string to each selected note", () => {
    useProjectStore.getState().assignSelectedTabString(3);

    expect(useProjectStore.getState().notes).toEqual([
      makeNote("high", 48, 3),
      makeNote("low", 30),
    ]);
  });

  it("moves selected notes independently between playable strings", () => {
    useProjectStore.getState().moveSelectedTabStrings("down");

    expect(useProjectStore.getState().notes).toEqual([
      makeNote("high", 48, 2),
      makeNote("low", 30),
    ]);
  });

  it("allows moving to string 5 only in five-string mode", () => {
    useProjectStore.setState({
      notes: [makeNote("low", 30, 4)],
      selectedNoteIds: new Set(["low"]),
    });
    useProjectStore.getState().moveSelectedTabStrings("down");
    expect(useProjectStore.getState().notes[0].tabString).toBe(4);

    useProjectStore
      .getState()
      .setTabOpenStringPitches([...TAB_OPEN_STRING_PRESETS.fiveString]);
    useProjectStore.getState().moveSelectedTabStrings("down");
    expect(useProjectStore.getState().notes[0].tabString).toBe(5);
  });

  it("clears overrides through undoable note updates", () => {
    useProjectStore.setState({ notes: [makeNote("high", 48, 3)] });

    useProjectStore.getState().clearSelectedTabStrings();
    expect(useProjectStore.getState().notes[0].tabString).toBeUndefined();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().notes[0].tabString).toBe(3);
  });
});
