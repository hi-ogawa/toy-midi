import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { audioManager } from "../lib/audio";
import {
  basicPitchClient,
  DEFAULT_TRANSCRIBE_PARAMS,
} from "../lib/basic-pitch";
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

export function AudioToMidi({ track }: { track: AudioTrack }) {
  const [params, setParams] = useState(DEFAULT_TRANSCRIBE_PARAMS);
  const [quantizeToGrid, setQuantizeToGrid] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [analyzed, setAnalyzed] = useState(false);
  const [noteCount, setNoteCount] = useState<number>();
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
    onSuccess: () => setAnalyzed(true),
    onError: (error) => {
      console.error("Failed to analyze audio:", error);
      toast.error("Failed to analyze audio");
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
    onSuccess: (count) => setNoteCount(count),
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
      ? `Analysis failed${formatElapsedSuffix(analyzeElapsedMs)}`
      : !analyzed
        ? "Not analyzed"
        : `Analyzed${formatElapsedSuffix(analyzeElapsedMs)}`;

  const conversionStatus = convertMutation.error
    ? `Failed${formatElapsedSuffix(convertElapsedMs)}`
    : noteCount !== undefined && convertElapsedMs !== undefined
      ? `${noteCount} notes in ${formatElapsed(convertElapsedMs)}`
      : undefined;

  return (
    <div className="w-96">
      <section className="space-y-3">
        <p className="truncate text-xs text-neutral-400" title={track.fileName}>
          <span className="text-neutral-500">Audio track:</span>{" "}
          <span
            data-testid="audio-to-midi-file-name"
            className="text-neutral-300"
          >
            {track.fileName}
          </span>
        </p>

        <p className="text-xs leading-relaxed text-neutral-400">
          Analyze the track once to prepare it for MIDI conversion.
        </p>

        <Button
          data-testid="analyze-button"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || analyzed}
          className="h-9 w-full gap-1.5 bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {analyzeMutation.isPending ? "Analyzing audio..." : "Analyze audio"}
        </Button>

        <div
          data-testid="audio-to-midi-analysis-status"
          className="h-4 text-left text-xs text-neutral-400"
        >
          {analysisStatus}
        </div>
      </section>

      <section
        className={`mt-4 space-y-4 border-t border-neutral-700 pt-4 ${analyzed ? "" : "opacity-50"}`}
      >
        <div>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-neutral-100">
              Conversion settings
            </h3>
            <button
              onClick={() => setParams(DEFAULT_TRANSCRIBE_PARAMS)}
              disabled={!analyzed}
              className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300 disabled:pointer-events-none"
            >
              Reset to defaults
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Adjust these settings and convert again without re-analyzing.
          </p>
        </div>

        <ThresholdSlider
          label="Frame threshold"
          hint="Higher values detect fewer notes"
          value={params.frameThreshold}
          disabled={!analyzed}
          onChange={(frameThreshold) =>
            setParams({ ...params, frameThreshold })
          }
        />
        <ThresholdSlider
          label="Onset threshold"
          hint="Higher values create fewer splits"
          value={params.onsetThreshold}
          disabled={!analyzed}
          onChange={(onsetThreshold) =>
            setParams({ ...params, onsetThreshold })
          }
        />

        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="audio-to-midi-min-note-length"
            className="text-xs text-neutral-300"
          >
            Minimal note length
          </label>
          <div className="flex items-center gap-2">
            <input
              id="audio-to-midi-min-note-length"
              type="number"
              min={0}
              max={500}
              step={10}
              disabled={!analyzed}
              value={params.minNoteLengthMs}
              onChange={(e) =>
                setParams({
                  ...params,
                  minNoteLengthMs: Number(e.target.value),
                })
              }
              className="h-8 w-20 rounded border border-neutral-600 bg-neutral-900 px-2 text-right text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
            <span className="w-5 text-xs text-neutral-500">ms</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-300">Pitch range</span>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <input
              type="number"
              aria-label="Minimum pitch (MIDI)"
              min={0}
              max={127}
              disabled={!analyzed}
              value={params.minPitchMidi}
              onChange={(e) =>
                setParams({ ...params, minPitchMidi: Number(e.target.value) })
              }
              className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-2 text-right text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
            <span className="w-7 tabular-nums">
              {midiToNoteName(params.minPitchMidi)}
            </span>
            <span className="text-neutral-600">to</span>
            <input
              type="number"
              aria-label="Maximum pitch (MIDI)"
              min={0}
              max={127}
              disabled={!analyzed}
              value={params.maxPitchMidi}
              onChange={(e) =>
                setParams({ ...params, maxPitchMidi: Number(e.target.value) })
              }
              className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-2 text-right text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
            <span className="w-7 tabular-nums">
              {midiToNoteName(params.maxPitchMidi)}
            </span>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300 has-disabled:cursor-default">
          <input
            type="checkbox"
            checked={quantizeToGrid}
            disabled={!analyzed}
            onChange={(e) => setQuantizeToGrid(e.target.checked)}
            className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
          />
          Quantize to current grid ({gridSnap})
        </label>

        <div className="space-y-2 border-t border-neutral-700 pt-4">
          <p className="text-xs leading-relaxed text-amber-200/70">
            Converting replaces all existing MIDI notes. You can undo this
            change.
          </p>
          <Button
            data-testid="convert-button"
            onClick={() => convertMutation.mutate()}
            disabled={!analyzed || convertMutation.isPending}
            className="h-9 w-full bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
          >
            {convertMutation.isPending ? "Converting..." : "Convert to MIDI"}
          </Button>
          <p
            data-testid="audio-to-midi-conversion-status"
            className="h-4 text-left text-xs text-neutral-400"
          >
            {conversionStatus}
          </p>
        </div>
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

function ThresholdSlider({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-neutral-300">
        <div>
          <label>{label}</label>
          <p className="mt-0.5 text-neutral-500">{hint}</p>
        </div>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={0.05}
        max={0.95}
        step={0.05}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
