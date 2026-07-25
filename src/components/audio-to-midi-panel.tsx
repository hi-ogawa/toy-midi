import { useMutation } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
} from "../stores/project-store";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

// One coalesce key per panel session: every live re-decode replaces notes,
// but the whole session stays a single undo step
let transcribeSessionCounter = 0;

export function AudioToMidiPanel({
  track,
  onClose,
}: {
  track: AudioTrack;
  onClose: () => void;
}) {
  const [params, setParams] = useState(DEFAULT_TRANSCRIBE_PARAMS);
  const [progress, setProgress] = useState<number | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [sessionKey] = useState(
    () => `audio-to-midi-${++transcribeSessionCounter}`,
  );
  const decodeSeqRef = useRef(0);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const buffer = audioManager.getAudioTrackBuffer(track.id);
      if (!buffer) {
        throw new Error("Audio is still loading");
      }
      setProgress(0);
      await basicPitchClient.analyze(track.assetKey, buffer, setProgress);
    },
    onSuccess: () => setAnalyzed(true),
    onError: (error) => {
      console.error("Failed to analyze audio:", error);
      toast.error("Failed to analyze audio");
    },
    onSettled: () => setProgress(null),
  });

  // Decoding is cheap (no inference), so parameter changes apply to the
  // project live: debounce slider drags and drop stale worker responses
  useEffect(() => {
    if (!analyzed) {
      return;
    }
    const seq = ++decodeSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const transcribed = await basicPitchClient.decode(
          track.assetKey,
          params,
        );
        if (seq !== decodeSeqRef.current) {
          return;
        }
        const { tempo, replaceAllNotes } = useProjectStore.getState();
        const notes = transcribed.map((note) => ({
          id: generateNoteId(),
          pitch: note.pitchMidi,
          start: secondsToBeats(note.startSeconds + track.offset, tempo),
          duration: secondsToBeats(note.durationSeconds, tempo),
          velocity: Math.max(
            1,
            Math.min(127, Math.round(note.amplitude * 127)),
          ),
        }));
        replaceAllNotes(notes, sessionKey);
        setNoteCount(notes.length);
      } catch (error) {
        console.error("Failed to decode notes:", error);
        toast.error("Failed to decode notes");
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [analyzed, params, track.assetKey, track.offset, sessionKey]);

  const status = analyzeMutation.isPending
    ? progress !== null
      ? `Analyzing ${Math.round(progress * 100)}%`
      : "Analyzing..."
    : analyzed
      ? noteCount !== null
        ? `Analyzed · ${noteCount} notes`
        : "Analyzed"
      : "Not analyzed";

  return (
    <div
      data-testid="audio-to-midi-panel"
      className="fixed bottom-4 right-4 z-40 w-80 space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
          <SparklesIcon className="size-4" />
          Audio to MIDI
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-200 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <p
        data-testid="audio-to-midi-file-name"
        className="text-sm text-neutral-300 truncate"
        title={track.fileName}
      >
        {track.fileName}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-400">{status}</span>
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
        <p className="text-xs text-neutral-500">
          Changes replace all MIDI notes live; the session is one undo step.
        </p>
        <Button
          onClick={() => setParams(DEFAULT_TRANSCRIBE_PARAMS)}
          disabled={!analyzed}
          className="h-8 px-3 text-sm text-neutral-300 hover:bg-accent"
        >
          Reset
        </Button>
      </div>
    </div>
  );
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
