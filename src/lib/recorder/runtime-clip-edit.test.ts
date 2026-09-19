import { expect, test, vi } from "vitest";
import { createStore } from "../../utils/store";
import type { AudioClip } from "./audio-clip";
import { deriveClipRegions } from "./clip-regions";
import {
  createDefaultRecorderRuntimeState,
  RecorderRuntime,
  type RecorderClipEdit,
} from "./runtime";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

test("previews and commits group trims with one update and only affected playback", () => {
  const { runtime, effects } = setup();
  const before = runtime.store.get();
  const edit: RecorderClipEdit = {
    type: "trim",
    changes: [
      { type: "clip", id: "first", edge: "end", value: 3 },
      { type: "clip", id: "second", edge: "start", value: 1 },
      { type: "clip", id: "take", edge: "end", value: 2 },
    ],
  };
  const onPersist = vi.fn();
  runtime.subscribePersistableState(onPersist);

  const preview = runtime.previewClipEdit(edit);
  expect(runtime.store.get()).toBe(before);
  expect(onPersist).not.toHaveBeenCalled();
  expect(effects.pause).not.toHaveBeenCalled();
  expect(effects.syncTrackPlayback).not.toHaveBeenCalled();
  expect(effects.syncYouTubePlayer).not.toHaveBeenCalled();
  expect(preview.audioTracks[1]).toBe(before.audioTracks[1]);
  expect(preview.referenceVideo).toBe(before.referenceVideo);
  expect(
    preview.audioTracks[0].regions.map((region) => [
      region.clip.id,
      region.timelineStart,
      region.timelineEnd,
    ]),
  ).toEqual([
    ["first", 0, 3],
    ["second", 3, 6],
  ]);

  runtime.commitClipEdit(edit);
  const after = runtime.store.get();
  expect(after.audioTracks).toEqual(preview.audioTracks);
  expect(after.recordingTrack).toEqual(preview.recordingTrack);
  expect(after.referenceVideo).toBe(before.referenceVideo);
  expect(onPersist).toHaveBeenCalledTimes(1);
  expect(effects.pause).toHaveBeenCalledTimes(1);
  expect(effects.play).toHaveBeenCalledTimes(1);
  expect(
    effects.syncTrackPlayback.mock.calls.map(([track]) => track.id),
  ).toEqual([before.recordingTrack.id, "audio"]);
  expect(effects.syncYouTubePlayer).not.toHaveBeenCalled();
});

test("moves audio and reference together while preserving unrelated tracks", () => {
  const { runtime, effects } = setup();
  const before = runtime.store.get();
  const edit: RecorderClipEdit = {
    type: "move",
    changes: [
      { type: "clip", id: "second", timelineOffset: 5 },
      { type: "reference", timelineOffset: 3 },
    ],
  };
  const preview = runtime.previewClipEdit(edit);
  expect(runtime.store.get()).toBe(before);
  expect(preview.recordingTrack).toBe(before.recordingTrack);
  expect(preview.audioTracks[1]).toBe(before.audioTracks[1]);
  expect(preview.referenceVideo?.timelineStart).toBe(3);
  expect(
    preview.audioTracks[0].regions.map((region) => [
      region.clip.id,
      region.timelineStart,
      region.timelineEnd,
    ]),
  ).toEqual([
    ["first", 0, 4],
    ["second", 5, 9],
  ]);
  expect(effects.syncYouTubePlayer).not.toHaveBeenCalled();

  runtime.commitClipEdit(edit);
  expect(runtime.store.get().audioTracks).toEqual(preview.audioTracks);
  expect(runtime.store.get().referenceVideo).toEqual(preview.referenceVideo);
  expect(
    effects.syncTrackPlayback.mock.calls.map(([track]) => track.id),
  ).toEqual(["audio"]);
  expect(effects.syncYouTubePlayer).toHaveBeenCalledTimes(1);
});

test("reference-only edits skip audio synchronization and stopped playback stays stopped", () => {
  const { runtime, effects } = setup();
  runtime.store.update({ isPlaying: false });
  const before = runtime.store.get();
  runtime.commitClipEdit({
    type: "move",
    changes: [{ type: "reference", timelineOffset: 2 }],
  });
  expect(runtime.store.get().audioTracks[0]).toBe(before.audioTracks[0]);
  expect(runtime.store.get().recordingTrack).toBe(before.recordingTrack);
  expect(effects.syncTrackPlayback).not.toHaveBeenCalled();
  expect(effects.syncYouTubePlayer).toHaveBeenCalledTimes(1);
  expect(effects.pause).not.toHaveBeenCalled();
  expect(effects.play).not.toHaveBeenCalled();
});

test("preview and commit share trim bounds and clip mute/solo region rules", () => {
  const { runtime } = setup();
  const state = runtime.store.get();
  runtime.store.update({
    audioTracks: [
      {
        ...state.audioTracks[0],
        clips: [
          { ...clip("first"), soloed: true },
          { ...clip("second"), timelineOffset: 2 },
          { ...clip("muted"), soloed: true, muted: true },
        ],
      },
    ],
  });
  const edit: RecorderClipEdit = {
    type: "trim",
    changes: [{ type: "clip", id: "first", edge: "end", value: 100 }],
  };
  const preview = runtime.previewClipEdit(edit);
  expect(preview.audioTracks[0].clips[0].trimEnd).toBe(4);
  expect(
    preview.audioTracks[0].regions.map((region) => region.clip.id),
  ).toEqual(["first"]);
  runtime.commitClipEdit(edit);
  expect(runtime.store.get().audioTracks).toEqual(preview.audioTracks);
});

function setup() {
  const state = createDefaultRecorderRuntimeState();
  const clips = [clip("first"), { ...clip("second"), timelineOffset: 2 }];
  state.audioTracks = [
    {
      ...state.recordingTrack,
      id: "audio",
      clips,
      regions: deriveClipRegions(clips),
    },
    { ...state.recordingTrack, id: "unrelated" },
  ];
  const takes = [clip("take")];
  state.recordingTrack = {
    ...state.recordingTrack,
    clips: takes,
    regions: deriveClipRegions(takes),
  };
  state.referenceVideo = {
    videoId: "video",
    timelineStart: 0,
    muted: false,
    duration: 10,
  };
  state.isPlaying = true;
  const effects = {
    pause: vi.fn(),
    play: vi.fn(),
    syncTrackPlayback: vi.fn(),
    syncYouTubePlayer: vi.fn(),
  };
  // Exercise the runtime methods with a real store and replace only browser audio effects.
  const runtime = Object.assign(Object.create(RecorderRuntime.prototype), {
    store: createStore(() => state),
    pause: effects.pause,
    transport: { play: effects.play },
    syncTrackPlayback: effects.syncTrackPlayback,
    syncYouTubePlayer: effects.syncYouTubePlayer,
  }) as RecorderRuntime;
  return { runtime, effects };
}

function clip(id: string): AudioClip {
  return {
    id,
    name: id,
    muted: false,
    soloed: false,
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
    timelineOffset: 0,
  };
}
