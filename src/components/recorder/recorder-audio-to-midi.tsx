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
import { PortalDialog } from "../ui/dialog";
import { Slider } from "../ui/slider";

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
  const sources = [
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
  const [sourceId, setSourceId] = useState(sources[0]?.track.id ?? "");
  const [mode, setMode] = useState<"append" | "replace">("append");
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

  const conversion = useMutation({
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
      if (current.tempo !== state.tempo) {
        throw new Error(
          "The project tempo changed. Convert again with the new tempo.",
        );
      }
      if (mode === "replace" && target.notes !== destination.notes) {
        throw new Error(
          "The MIDI notes changed during conversion. Convert again to replace them.",
        );
      }
      if (notes.length > 0) {
        runtime.setMidiTrackNotes(
          track.id,
          mode === "append" ? [...target.notes, ...notes] : notes,
        );
      }
      return notes.length;
    },
    onMutate: () => setProgress(0),
  });

  useEffect(() => bassPitchClient.warmUp(), []);

  const status = conversion.isPending
    ? `Converting ${Math.round(progress * 100)}%`
    : conversion.error
      ? conversion.error.message
      : conversion.data === 0
        ? "No notes detected. Existing notes were kept. Try lowering the activity threshold."
        : conversion.data !== undefined
          ? `Created ${conversion.data} notes in ${track.name}.`
          : "";

  return (
    <PortalDialog
      isOpen
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
          disabled={conversion.isPending}
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
          <label className="block space-y-2 text-sm">
            <span>Destination notes</span>
            <select
              aria-label="Destination notes"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "append" | "replace")
              }
              className="w-full rounded border border-neutral-600 bg-neutral-900 p-2"
            >
              <option value="append">Append to existing notes</option>
              <option value="replace">Replace all notes in {track.name}</option>
            </select>
          </label>
          {mode === "replace" && track.notes.length > 0 && (
            <p className="text-xs text-amber-300">
              A successful conversion replaces {track.notes.length} existing
              notes. Undo is not available yet.
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
            conversion.isPending ||
            !sources.some(({ track }) => track.id === sourceId)
          }
          onClick={() => conversion.mutate()}
        >
          {conversion.isPending ? "Converting..." : "Convert to MIDI"}
        </Button>
        <p role="status" className="min-h-4 text-xs text-neutral-300">
          {status}
        </p>
      </div>
    </PortalDialog>
  );
}
