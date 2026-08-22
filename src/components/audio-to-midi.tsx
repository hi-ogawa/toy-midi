import { useMutation } from "@tanstack/react-query";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { audioManager } from "../lib/audio";
import { bassPitchClient } from "../lib/bass-pitch/client";
import {
  DEFAULT_GRID_ACTIVITY_DB,
  DEFAULT_GRID_SPLIT_THRESHOLD,
  makeGridTranscribeParams,
} from "../lib/bass-pitch/transcription";
import {
  type AudioTrack,
  generateNoteId,
  useProjectStore,
} from "../lib/project-store";
import { secondsToBeats } from "../lib/timeline";
import { GRID_SNAP_VALUES } from "../types";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

export function AudioToMidi({ track }: { track: AudioTrack }) {
  return (
    <div className="w-96 space-y-4">
      <p
        data-testid="audio-to-midi-file-name"
        className="truncate text-xs text-neutral-300"
        title={track.fileName}
      >
        {track.fileName}
      </p>
      <GridBassConvert track={track} />
    </div>
  );
}

// Grid-guided bass conversion has no separate analyze stage; one call runs
// pYIN plus the grid decisions and commits via replaceAllNotes, so it is one
// undo entry per press. Grid cell resolution follows the current grid snap,
// and the note timing arrives already grid-aligned in project seconds.
function GridBassConvert({ track }: { track: AudioTrack }) {
  const [activityDb, setActivityDb] = useState(DEFAULT_GRID_ACTIVITY_DB);
  const [splitThreshold, setSplitThreshold] = useState(
    DEFAULT_GRID_SPLIT_THRESHOLD,
  );
  const [progress, setProgress] = useState<number>();
  const [convertElapsedMs, setConvertElapsedMs] = useState<number>();
  const convertStartedAt = useRef<number>(undefined);

  useEffect(() => {
    bassPitchClient.warmUp();
  }, []);

  const convertMutation = useMutation({
    mutationFn: async () => {
      const buffer = audioManager.getAudioTrackBuffer(track.id);
      if (!buffer) {
        throw new Error("Audio is still loading");
      }
      const { tempo, gridSnap, replaceAllNotes } = useProjectStore.getState();
      const cellsPerBeat = Math.max(
        1,
        Math.round(1 / GRID_SNAP_VALUES[gridSnap]),
      );
      const transcribed = await bassPitchClient.transcribe(
        buffer,
        makeGridTranscribeParams({
          offset: track.offset,
          bpm: tempo,
          cellsPerBeat,
          activityDb,
          splitThreshold,
        }),
        setProgress,
      );
      const notes = transcribed.map((note) => ({
        id: generateNoteId(),
        pitch: note.pitch,
        start: secondsToBeats(note.project_start, tempo),
        duration: secondsToBeats(note.project_end - note.project_start, tempo),
        velocity: 100,
      }));
      replaceAllNotes(notes);
      return notes.length;
    },
    onMutate: () => {
      convertStartedAt.current = performance.now();
      setConvertElapsedMs(undefined);
      setProgress(0);
    },
    onError: (error) => {
      console.error("Failed to convert audio to MIDI:", error);
      toast.error("Failed to convert audio to MIDI");
    },
    onSettled: () => {
      setProgress(undefined);
      if (convertStartedAt.current !== undefined) {
        setConvertElapsedMs(performance.now() - convertStartedAt.current);
      }
    },
  });

  const conversionStatus = convertMutation.isPending
    ? `Converting ${Math.round((progress ?? 0) * 100)}%`
    : convertMutation.error
      ? "Conversion failed"
      : convertMutation.data === 0
        ? "No notes detected. Check the project tempo and the track offset."
        : convertMutation.data !== undefined && convertElapsedMs !== undefined
          ? `Created ${convertMutation.data} notes in ${formatElapsed(convertElapsedMs)}`
          : "Replaces all existing notes. Undo restores them.";

  return (
    <>
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
        <div className="flex justify-end pt-1">
          <button
            onClick={() => {
              setActivityDb(DEFAULT_GRID_ACTIVITY_DB);
              setSplitThreshold(DEFAULT_GRID_SPLIT_THRESHOLD);
            }}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
          >
            Reset to defaults
          </button>
        </div>
      </section>

      <section className="space-y-2 border-t border-neutral-700 pt-4">
        <Button
          data-testid="convert-button"
          onClick={() => convertMutation.mutate()}
          disabled={convertMutation.isPending}
          className="h-9 w-full bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {convertMutation.isPending ? "Converting..." : "Convert to MIDI"}
        </Button>
        <p
          data-testid="audio-to-midi-conversion-status"
          aria-live="polite"
          className="min-h-4 text-xs text-neutral-400"
        >
          {conversionStatus}
        </p>
      </section>
    </>
  );
}

function formatElapsed(elapsedMs: number) {
  return elapsedMs < 1000
    ? `${Math.round(elapsedMs)}ms`
    : `${(elapsedMs / 1000).toFixed(1)}s`;
}

function ParamSlider({
  label,
  hint,
  valueText,
  ...sliderProps
}: {
  label: string;
  hint?: string;
  valueText: string;
} & ComponentProps<typeof Slider>) {
  return (
    <div>
      <div className="mb-2.5 flex justify-between text-xs text-neutral-300">
        <div>
          <label>{label}</label>
          {hint && <p className="mt-0.5 text-neutral-500">{hint}</p>}
        </div>
        <span className="tabular-nums">{valueText}</span>
      </div>
      <Slider {...sliderProps} />
    </div>
  );
}
