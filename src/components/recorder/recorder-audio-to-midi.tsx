import { useMutation } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { bassPitchClient } from "../../lib/bass-pitch/client";
import {
  DEFAULT_GRID_ACTIVITY_DB,
  DEFAULT_GRID_SPLIT_THRESHOLD,
} from "../../lib/bass-pitch/transcription";
import { getClipSources } from "../../lib/recorder/audio-sources";
import { transcribeRecorderAudio } from "../../lib/recorder/audio-to-midi";
import {
  getRecordingTrack,
  RECORDING_TRACK_ID,
} from "../../lib/recorder/recording-track";
import type {
  MidiTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { RecorderPanel } from "./recorder-panel";

const CONVERSION_CANCELLED_ERROR = new Error("Conversion cancelled");

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
  const conversionController = useRef<AbortController>(undefined);
  useEffect(() => {
    bassPitchClient.warmUp();
    return () =>
      conversionController.current?.abort(CONVERSION_CANCELLED_ERROR);
  }, []);

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      conversionController.current = controller;
      const state = runtime.store.get();
      const destination = state.midiTracks.find(
        (candidate) => candidate.id === track.id,
      );
      const source = state.audioTracks.find((track) => track.id === sourceId);
      if (!destination || !source) {
        throw new Error("The source or destination track is missing.");
      }
      const notes = await transcribeRecorderAudio({
        sources: getClipSources(source.regions),
        tempo: state.tempo,
        cellsPerBeat,
        activityDb,
        splitThreshold,
        onProgress: setProgress,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
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
    onError: (error) => {
      if (error !== CONVERSION_CANCELLED_ERROR) {
        console.error(error);
        toast.error(error.message);
      }
    },
    onSettled: () => {
      conversionController.current = undefined;
    },
  });

  const status = transcribeMutation.isPending
    ? `Converting ${Math.round(progress * 100)}%`
    : transcribeMutation.error
      ? transcribeMutation.error.message
      : transcribeMutation.data === 0
        ? "No notes detected. Existing notes were kept. Try lowering the activity threshold."
        : transcribeMutation.data !== undefined
          ? `Created ${transcribeMutation.data} notes in ${track.name}.`
          : "A successful conversion replaces all existing notes in this MIDI track.";

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
          Transcribe a selected audio track into this MIDI track using the
          project tempo and grid.
        </p>
        <fieldset
          disabled={transcribeMutation.isPending}
          className="space-y-5 disabled:opacity-60"
        >
          <label className="flex flex-col gap-2 text-sm">
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
          <section className="space-y-5 border-t border-neutral-700 pt-4">
            <ParamSlider
              label="Activity threshold"
              hint="Higher values detect fewer notes"
              valueText={`${activityDb} dBFS`}
              value={[activityDb]}
              min={-60}
              max={-10}
              step={1}
              onValueChange={([value]) => setActivityDb(value)}
            />
            <ParamSlider
              label="Split threshold"
              hint="Higher values create fewer repeated-note splits"
              valueText={splitThreshold.toFixed(2)}
              value={[splitThreshold]}
              min={0.05}
              max={0.95}
              step={0.05}
              onValueChange={([value]) => setSplitThreshold(value)}
            />
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>
                {state.tempo} BPM · 1/{cellsPerBeat * 4} grid
              </span>
              <button
                type="button"
                className="text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                onClick={() => {
                  setActivityDb(DEFAULT_GRID_ACTIVITY_DB);
                  setSplitThreshold(DEFAULT_GRID_SPLIT_THRESHOLD);
                }}
              >
                Reset to defaults
              </button>
            </div>
          </section>
        </fieldset>
        <section className="space-y-2 border-t border-neutral-700 pt-4">
          {sources.length === 0 && (
            <p className="text-sm text-neutral-400">
              Load audio or record a take before converting.
            </p>
          )}
          <Button
            className={`h-9 w-full cursor-pointer px-3 text-sm ${transcribeMutation.isPending ? "border-neutral-600 text-neutral-100 hover:bg-neutral-700 active:bg-neutral-600" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            disabled={
              !transcribeMutation.isPending &&
              !sources.some(({ track }) => track.id === sourceId)
            }
            onClick={() => {
              if (transcribeMutation.isPending) {
                conversionController.current?.abort(CONVERSION_CANCELLED_ERROR);
              } else {
                transcribeMutation.mutate();
              }
            }}
          >
            {transcribeMutation.isPending ? "Cancel" : "Convert to MIDI"}
          </Button>
          <p
            role="status"
            className="flex min-h-4 items-start gap-1.5 text-xs text-neutral-400"
          >
            {transcribeMutation.isSuccess &&
              (transcribeMutation.data ?? 0) > 0 && (
                <CheckIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-emerald-400"
                />
              )}
            {status}
          </p>
        </section>
      </div>
    </RecorderPanel>
  );
}

function getTranscriptionSources(state: RecorderRuntimeState) {
  return [
    ...state.audioTracks
      .filter((track) => track.id !== RECORDING_TRACK_ID)
      .map((source, index) => ({
        track: source,
        label: `Audio ${index + 1}${source.clips[0] ? ` · ${source.clips[0].name}` : ""}`,
      })),
    {
      track: getRecordingTrack(state.audioTracks),
      label: "Capture · committed takes",
    },
  ].filter(({ track }) =>
    track.regions.some(
      ({ clip, timelineStart, timelineEnd }) =>
        clip.buffer && timelineEnd > Math.max(0, timelineStart),
    ),
  );
}

function ParamSlider({
  label,
  hint,
  valueText,
  ...sliderProps
}: {
  label: string;
  hint: string;
  valueText: string;
} & ComponentProps<typeof Slider>) {
  return (
    <div>
      <div className="mb-2.5 flex justify-between text-xs text-neutral-300">
        <div>
          <span>{label}</span>
          <p className="mt-0.5 text-neutral-500">{hint}</p>
        </div>
        <span className="tabular-nums">{valueText}</span>
      </div>
      <Slider aria-label={label} {...sliderProps} />
    </div>
  );
}
