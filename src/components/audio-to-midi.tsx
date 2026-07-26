import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { audioManager } from "../lib/audio";
import {
  basicPitchClient,
  DEFAULT_TRANSCRIBE_PARAMS,
} from "../lib/basic-pitch";
import { midiToNoteName } from "../lib/music";
import {
  type AudioTrack,
  generateNoteId,
  secondsToBeats,
  useProjectStore,
} from "../lib/project-store";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

export function AudioToMidi({ track }: { track: AudioTrack }) {
  const [params, setParams] = useState(DEFAULT_TRANSCRIBE_PARAMS);
  const [progress, setProgress] = useState<number>();
  const [analyzed, setAnalyzed] = useState(false);
  const [noteCount, setNoteCount] = useState<number>();
  const [analyzeElapsedMs, setAnalyzeElapsedMs] = useState<number>();
  const [convertElapsedMs, setConvertElapsedMs] = useState<number>();
  const analyzeStartedAt = useRef<number>(undefined);
  const convertStartedAt = useRef<number>(undefined);

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
  // TODO: offer post-processing steps as extra convert parameters. A direct
  // quantize-to-grid option is trivial (snap starts/durations like
  // quantizeSelectedNotes before committing); an octave-ghost filter (drop
  // notes +12/+19 semitones above a concurrent louder note) would target the
  // dominant error class on real Demucs bass stems.
  const convertMutation = useMutation({
    mutationFn: async () => {
      const transcribed = await basicPitchClient.decode(track.assetKey, params);
      const { tempo, replaceAllNotes } = useProjectStore.getState();
      const notes = transcribed.map((note) => ({
        id: generateNoteId(),
        pitch: note.pitchMidi,
        start: secondsToBeats(note.startSeconds + track.offset, tempo),
        duration: secondsToBeats(note.durationSeconds, tempo),
        velocity: Math.max(1, Math.min(127, Math.round(note.amplitude * 127))),
      }));
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
    <div className="w-72 space-y-4">
      <p
        data-testid="audio-to-midi-file-name"
        className="text-sm text-neutral-300 truncate"
        title={track.fileName}
      >
        {track.fileName}
      </p>

      {/* TODO: tweak this intro copy */}
      <p className="text-xs text-neutral-500">
        Analyze the audio once, then adjust the settings and convert to MIDI as
        often as you like — analysis is cached, so converting is instant.
      </p>

      <div className="flex items-center justify-between gap-2">
        <span
          data-testid="audio-to-midi-analysis-status"
          className="text-xs text-neutral-400"
        >
          {analysisStatus}
        </span>
        <Button
          data-testid="analyze-button"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || analyzed}
          className="h-8 gap-1.5 px-3 bg-primary text-sm text-primary-foreground hover:bg-primary/90"
        >
          Analyze
        </Button>
      </div>

      <ThresholdSlider
        label="Frame threshold (higher = fewer notes)"
        value={params.frameThreshold}
        disabled={!analyzed}
        onChange={(frameThreshold) => setParams({ ...params, frameThreshold })}
      />
      <ThresholdSlider
        label="Onset threshold (higher = fewer splits)"
        value={params.onsetThreshold}
        disabled={!analyzed}
        onChange={(onsetThreshold) => setParams({ ...params, onsetThreshold })}
      />

      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="audio-to-midi-min-note-length"
          className="text-xs text-neutral-400"
        >
          Min note length (ms)
        </label>
        <input
          id="audio-to-midi-min-note-length"
          type="number"
          min={0}
          max={500}
          step={10}
          disabled={!analyzed}
          value={params.minNoteLengthMs}
          onChange={(e) =>
            setParams({ ...params, minNoteLengthMs: Number(e.target.value) })
          }
          className="w-20 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500 disabled:opacity-50"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-400">Pitch range</span>
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
            className="w-16 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500 disabled:opacity-50"
          />
          <span className="w-8 tabular-nums">
            {midiToNoteName(params.minPitchMidi)}
          </span>
          <span>to</span>
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
            className="w-16 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500 disabled:opacity-50"
          />
          <span className="w-8 tabular-nums">
            {midiToNoteName(params.maxPitchMidi)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setParams(DEFAULT_TRANSCRIBE_PARAMS)}
          disabled={!analyzed}
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300 disabled:opacity-50 disabled:hover:text-neutral-500"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-2">
          {conversionStatus && (
            <span
              data-testid="audio-to-midi-conversion-status"
              className="text-xs text-neutral-400"
            >
              {conversionStatus}
            </span>
          )}
          <Button
            data-testid="convert-button"
            onClick={() => convertMutation.mutate()}
            disabled={!analyzed || convertMutation.isPending}
            title="Convert with current settings, replacing all MIDI notes"
            className="h-8 px-3 bg-primary text-sm text-primary-foreground hover:bg-primary/90"
          >
            {convertMutation.isPending ? "Converting..." : "Convert to MIDI"}
          </Button>
        </div>
      </div>
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
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div className="flex justify-between mb-1 text-xs text-neutral-400">
        <label>{label}</label>
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
