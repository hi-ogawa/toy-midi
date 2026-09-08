import { expect, test } from "vitest";
import { createDefaultPeakingEq } from "./eq";
import { deserializeRecorderRuntimeState } from "./persistence";
import { RecorderRuntime } from "./runtime";

test("edits EQ independently without initializing audio or rebuilding the comp", () => {
  const runtime = new RecorderRuntime();
  const id = runtime.addAudioTrack();
  const secondId = runtime.addAudioTrack();
  const regions = runtime.store.get().takeRegions;
  runtime.setAudioTrackEq({ id, update: { frequency: 500, gain: 6 } });
  runtime.setRecordingTrackEq({ q: 2, bypassed: true });
  const state = runtime.store.get();
  expect(state.audioTracks.find((track) => track.id === id)?.eq).toEqual({
    frequency: 500,
    gain: 6,
    q: 1,
    bypassed: false,
  });
  expect(state.audioTracks.find((track) => track.id === secondId)?.eq).toEqual(
    createDefaultPeakingEq(),
  );
  expect(state.recordingTrack.eq).toEqual({
    frequency: 1000,
    gain: 0,
    q: 2,
    bypassed: true,
  });
  expect(state.takeRegions).toBe(regions);

  // Empty tracks need no AudioContext to round-trip their saved settings.
  const project = runtime.serializeProject();
  const restored = deserializeRecorderRuntimeState({
    context: {} as AudioContext,
    project,
  });
  expect(restored.audioTracks.map((track) => track.eq)).toEqual(
    state.audioTracks.map((track) => track.eq),
  );
  expect(restored.recordingTrack.eq).toEqual(state.recordingTrack.eq);

  // Projects from before EQ support acquire independent defaults.
  for (const track of project.audioTracks) {
    delete track.eq;
  }
  delete project.recordingTrack.eq;
  const legacy = deserializeRecorderRuntimeState({
    context: {} as AudioContext,
    project,
  });
  expect(legacy.audioTracks[0]!.eq).toEqual(createDefaultPeakingEq());
  expect(legacy.recordingTrack.eq).toEqual(createDefaultPeakingEq());
  expect(legacy.audioTracks[0]!.eq).not.toBe(legacy.recordingTrack.eq);
});

test("bounds EQ values at the runtime boundary", () => {
  const runtime = new RecorderRuntime();
  const id = runtime.addAudioTrack();
  runtime.setAudioTrackEq({
    id,
    update: { frequency: 50000, gain: -30, q: 0 },
  });
  expect(runtime.store.get().audioTracks[0]!.eq).toEqual({
    frequency: 20000,
    gain: -18,
    q: 0.1,
    bypassed: false,
  });
  runtime.setRecordingTrackEq({ frequency: Number.NaN, gain: Infinity, q: 99 });
  expect(runtime.store.get().recordingTrack.eq).toEqual({
    frequency: 1000,
    gain: 0,
    q: 18,
    bypassed: false,
  });
});
