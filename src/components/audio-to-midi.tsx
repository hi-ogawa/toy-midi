import { useMutation } from "@tanstack/react-query";
import { type ComponentProps, useRef, useState } from "react";
import { toast } from "sonner";
import { audioManager } from "../lib/audio";
import { basicPitchClient } from "../lib/basic-pitch/client";
import { DEFAULT_TRANSCRIBE_PARAMS } from "../lib/basic-pitch/transcription";
import { midiToNoteName, snapToGrid } from "../lib/music";
import {
  type AudioTrack,
  generateNoteId,
  secondsToBeats,
  useProjectStore,
} from "../lib/project-store";
import { GRID_SNAP_VALUES } from "../types";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { cn } from "./ui/utils";

// TODO(ui): deferred polish from the panel UX review
// - merge analyze into convert: auto-analyze on the first convert so the
//   panel has a single primary action and no gated state
// - show "Convert again" on the convert button when params/quantize diverge
//   from the settings used by the last successful convert
// - show "Reset to defaults" only when params diverge from the defaults
// - derive analysis state from the worker cache: reopening the panel shows an
//   analyzed track as "Not analyzed" and resets tuned params
// - allow canceling an in-flight analysis
// - relabel threshold sliders in user terms (needs direction flip so that
//   right = more notes/splits)
// - cached analysis timing is misleading because it measures the client call
//   rather than the original worker inference
export function AudioToMidi({ track }: { track: AudioTrack }) {
  const [params, setParams] = useState(DEFAULT_TRANSCRIBE_PARAMS);
  const [quantizeToGrid, setQuantizeToGrid] = useState(true);
  const [progress, setProgress] = useState<number>();
  const [analyzeElapsedMs, setAnalyzeElapsedMs] = useState<number>();
  const [convertElapsedMs, setConvertElapsedMs] = useState<number>();
  const analyzeStartedAt = useRef<number>(undefined);
  const convertStartedAt = useRef<number>(undefined);
  const gridSnap = useProjectStore((state) => state.gridSnap);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const buffer = audioManager.getAudioTrackBuffer(track.id);
      if (!buffer) {
        throw new Error("Audio is still loading");
      }
      setProgress(0);
      await basicPitchClient.analyze(track.assetKey, buffer, setProgress);
    },
    onMutate: () => {
      analyzeStartedAt.current = performance.now();
      setAnalyzeElapsedMs(undefined);
    },
    onError: (error) => {
      console.error("Failed to analyze audio:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to analyze audio",
      );
    },
    onSettled: () => {
      setProgress(undefined);
      if (analyzeStartedAt.current !== undefined) {
        setAnalyzeElapsedMs(performance.now() - analyzeStartedAt.current);
      }
    },
  });

  // Parameter edits only stage locally; Convert to MIDI is the explicit
  // commit (worker `decode` stage), one replaceAllNotes and thus one undo
  // entry per press.
  // TODO: offer an octave-ghost filter as an extra convert parameter. Dropping
  // notes +12/+19 semitones above a concurrent louder note would target the
  // dominant error class on real Demucs bass stems.
  const convertMutation = useMutation({
    mutationFn: async () => {
      const transcribed = await basicPitchClient.decode(track.assetKey, params);
      const { tempo, gridSnap, replaceAllNotes } = useProjectStore.getState();
      const gridSize = GRID_SNAP_VALUES[gridSnap];
      const notes = transcribed.map((note) => {
        const start = secondsToBeats(note.startSeconds + track.offset, tempo);
        const duration = secondsToBeats(note.durationSeconds, tempo);
        return {
          id: generateNoteId(),
          pitch: note.pitchMidi,
          start: quantizeToGrid ? snapToGrid(start, gridSize) : start,
          duration: quantizeToGrid
            ? Math.max(gridSize, snapToGrid(duration, gridSize))
            : duration,
          velocity: Math.max(
            1,
            Math.min(127, Math.round(note.amplitude * 127)),
          ),
        };
      });
      replaceAllNotes(notes);
      return notes.length;
    },
    onMutate: () => {
      convertStartedAt.current = performance.now();
      setConvertElapsedMs(undefined);
    },
    onError: (error) => {
      console.error("Failed to convert audio to MIDI:", error);
      toast.error("Failed to convert audio to MIDI");
    },
    onSettled: () => {
      if (convertStartedAt.current !== undefined) {
        setConvertElapsedMs(performance.now() - convertStartedAt.current);
      }
    },
  });

  const analysisStatus = analyzeMutation.isPending
    ? progress !== undefined
      ? `Analyzing ${Math.round(progress * 100)}%`
      : "Analyzing..."
    : analyzeMutation.error
      ? "Analysis failed"
      : !analyzeMutation.isSuccess
        ? "Not analyzed"
        : `Analyzed${formatElapsedSuffix(analyzeElapsedMs)}`;

  const conversionStatus = convertMutation.error
    ? "Conversion failed"
    : convertMutation.data === 0
      ? "No notes detected. Try lowering the frame threshold or widening the pitch range."
      : convertMutation.data !== undefined && convertElapsedMs !== undefined
        ? `Created ${convertMutation.data} notes in ${formatElapsed(convertElapsedMs)}`
        : "Replaces all existing notes. Undo restores them.";

  return (
    <div className="w-96 space-y-4">
      <section className="space-y-2">
        <p
          data-testid="audio-to-midi-file-name"
          className="truncate text-xs text-neutral-300"
          title={track.fileName}
        >
          {track.fileName}
        </p>

        <Button
          data-testid="analyze-button"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || analyzeMutation.isSuccess}
          className={cn(
            "h-9 w-full px-3 text-sm",
            analyzeMutation.isSuccess
              ? "bg-background shadow-xs dark:border-input dark:bg-input/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {analyzeMutation.isPending ? "Analyzing audio..." : "Analyze audio"}
        </Button>

        <div
          data-testid="audio-to-midi-analysis-status"
          aria-live="polite"
          className="h-4 text-xs text-neutral-400"
        >
          {analysisStatus}
        </div>
      </section>

      <section className="space-y-5 border-t border-neutral-700 pt-4">
        <ParamSlider
          label="Frame threshold"
          hint="Higher values detect fewer notes"
          valueText={params.frameThreshold.toFixed(2)}
          value={[params.frameThreshold]}
          min={0.05}
          max={0.95}
          step={0.05}
          onValueChange={([frameThreshold]) =>
            setParams({ ...params, frameThreshold })
          }
        />
        <ParamSlider
          label="Onset threshold"
          hint="Higher values create fewer splits"
          valueText={params.onsetThreshold.toFixed(2)}
          value={[params.onsetThreshold]}
          min={0.05}
          max={0.95}
          step={0.05}
          onValueChange={([onsetThreshold]) =>
            setParams({ ...params, onsetThreshold })
          }
        />
        <ParamSlider
          label="Minimum note length"
          valueText={`${params.minNoteLengthMs} ms`}
          value={[params.minNoteLengthMs]}
          min={0}
          max={500}
          step={1}
          onValueChange={([minNoteLengthMs]) =>
            setParams({ ...params, minNoteLengthMs })
          }
        />
        {/* Slider bounds are the model's full pitch range (A0-C8) */}
        <ParamSlider
          label="Pitch range"
          valueText={`${midiToNoteName(params.minPitchMidi)} – ${midiToNoteName(params.maxPitchMidi)}`}
          value={[params.minPitchMidi, params.maxPitchMidi]}
          min={21}
          max={108}
          step={1}
          onValueChange={([minPitchMidi, maxPitchMidi]) =>
            setParams({ ...params, minPitchMidi, maxPitchMidi })
          }
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={quantizeToGrid}
              onChange={(e) => setQuantizeToGrid(e.target.checked)}
              className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
            />
            Quantize to current grid ({gridSnap})
          </label>
          <button
            onClick={() => setParams(DEFAULT_TRANSCRIBE_PARAMS)}
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
          disabled={!analyzeMutation.isSuccess || convertMutation.isPending}
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
    </div>
  );
}

function formatElapsedSuffix(elapsedMs: number | undefined) {
  return elapsedMs === undefined ? "" : ` in ${formatElapsed(elapsedMs)}`;
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
