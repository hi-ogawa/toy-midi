import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { bassPitchClient } from "../../lib/bass-pitch/client";
import {
  DEFAULT_GRID_ACTIVITY_DB,
  DEFAULT_GRID_SPLIT_THRESHOLD,
} from "../../lib/bass-pitch/transcription";
import { getClipSources } from "../../lib/recorder/audio-sources";
import { transcribeRecorderAudio } from "../../lib/recorder/audio-to-midi";
import type {
  MidiTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { RecorderPanel } from "./recorder-panel";

export function useRecorderAudioToMidiUi() {
  const [openTranscriptions, setOpenTranscriptions] = useState<
    ReadonlySet<string>
  >(new Set());

  function openTranscription(id: string) {
    setOpenTranscriptions((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function closeTranscription(id: string) {
    setOpenTranscriptions((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  return { openTranscriptions, openTranscription, closeTranscription };
}

export function RecorderAudioToMidi({
  runtime,
  state,
  track,
  cellsPerBeat,
  onClose,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  track: MidiTrackState;
  cellsPerBeat: number;
  onClose: () => void;
}) {
  const sources = getTranscriptionSources(state);
  const [sourceId, setSourceId] = useState(sources[0]?.track.id ?? "");
  const [activityDb, setActivityDb] = useState(DEFAULT_GRID_ACTIVITY_DB);
  const [splitThreshold, setSplitThreshold] = useState(
    DEFAULT_GRID_SPLIT_THRESHOLD,
  );
  const [progress, setProgress] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      const state = runtime.store.get();
      const destination = state.midiTracks.find(
        (candidate) => candidate.id === track.id,
      );
      const source = [...state.audioTracks, state.recordingTrack].find(
        (track) => track.id === sourceId,
      );
      if (!destination || !source) {
        throw new Error("The source or destination track is missing.");
      }
      const notes = await transcribeRecorderAudio({
        sources: getClipSources(source.regions),
        tempo: state.tempo,
        cellsPerBeat,
        activityDb,
        splitThreshold,
        onProgress: (progress) => {
          if (mounted.current) {
            setProgress(progress);
          }
        },
      });
      if (!mounted.current) {
        return;
      }
      const current = runtime.store.get();
      const target = current.midiTracks.find(
        (candidate) => candidate.id === track.id,
      );
      if (!target) {
        throw new Error("The destination MIDI track was removed.");
      }
      if (notes.length > 0) {
        runtime.setMidiTrackNotes(track.id, notes);
      }
      return notes.length;
    },
    onMutate: () => setProgress(0),
  });

  useEffect(() => bassPitchClient.warmUp(), []);

  const status = transcribeMutation.isPending
    ? `Converting ${Math.round(progress * 100)}%`
    : transcribeMutation.error
      ? transcribeMutation.error.message
      : transcribeMutation.data === 0
        ? "No notes detected. Existing notes were kept. Try lowering the activity threshold."
        : transcribeMutation.data !== undefined
          ? `Created ${transcribeMutation.data} notes in ${track.name}.`
          : "";

  return (
    <RecorderPanel
      closeLabel="Close Audio to MIDI"
      className="pointer-events-auto w-[440px] shrink-0"
      contentClassName="max-h-[calc(100vh-8rem)] overflow-y-auto px-4 py-3"
      onClose={onClose}
      title={`Audio to MIDI · ${track.name}`}
      data-testid="recorder-audio-to-midi"
    >
      <div className="space-y-5">
        <p className="text-sm text-neutral-400">
          Transcribe a single bass line into this MIDI track using the project
          tempo and grid.
        </p>
        <fieldset
          disabled={transcribeMutation.isPending}
          className="space-y-5 disabled:opacity-60"
        >
          <label className="block space-y-2 text-sm">
            <span>Source audio track</span>
            <select
              autoFocus
              aria-label="Source audio track"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              className="w-full rounded border border-neutral-600 bg-neutral-900 p-2"
            >
              {sources.length === 0 && (
                <option value="">No audio available</option>
              )}
              {sources.map(({ track, label }) => (
                <option key={track.id} value={track.id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-400">
            Uses the full committed arrangement, including trims, gaps, and take
            selection, before track volume and EQ. Moving the audio later does
            not move generated notes.
          </p>
          {track.notes.length > 0 && (
            <p className="text-xs text-amber-300">
              A successful conversion replaces {track.notes.length} existing
              notes.
            </p>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Activity threshold</span>
              <span>{activityDb} dBFS</span>
            </div>
            <Slider
              aria-label="Activity threshold"
              value={[activityDb]}
              min={-60}
              max={-10}
              step={1}
              onValueChange={([value]) => setActivityDb(value)}
            />
            <p className="text-xs text-neutral-500">
              Higher values detect fewer notes.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Split threshold</span>
              <span>{splitThreshold.toFixed(2)}</span>
            </div>
            <Slider
              aria-label="Split threshold"
              value={[splitThreshold]}
              min={0.05}
              max={0.95}
              step={0.05}
              onValueChange={([value]) => setSplitThreshold(value)}
            />
            <p className="text-xs text-neutral-500">
              Higher values create fewer repeated-note splits.
            </p>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>
              {state.tempo} BPM · 1/{cellsPerBeat * 4} grid
            </span>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setActivityDb(DEFAULT_GRID_ACTIVITY_DB);
                setSplitThreshold(DEFAULT_GRID_SPLIT_THRESHOLD);
              }}
            >
              Reset thresholds
            </button>
          </div>
        </fieldset>
        {sources.length === 0 && (
          <p className="text-sm text-neutral-400">
            Load audio or record a take before converting.
          </p>
        )}
        <Button
          className="h-9 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={
            transcribeMutation.isPending ||
            !sources.some(({ track }) => track.id === sourceId)
          }
          onClick={() => transcribeMutation.mutate()}
        >
          {transcribeMutation.isPending ? "Converting..." : "Convert to MIDI"}
        </Button>
        <p role="status" className="min-h-4 text-xs text-neutral-300">
          {status}
        </p>
      </div>
    </RecorderPanel>
  );
}

function getTranscriptionSources(state: RecorderRuntimeState) {
  return [
    ...state.audioTracks.map((source, index) => ({
      track: source,
      label: `Audio ${index + 1}${source.clips[0] ? ` · ${source.clips[0].name}` : ""}`,
    })),
    { track: state.recordingTrack, label: "Capture · committed takes" },
  ].filter(({ track }) =>
    track.regions.some(
      ({ clip, timelineStart, timelineEnd }) =>
        clip.buffer && timelineEnd > Math.max(0, timelineStart),
    ),
  );
}
