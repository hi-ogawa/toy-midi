import { beforeEach, describe, expect, it } from "vitest";
import { type AudioTrack, useProjectStore } from "./project-store";

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
