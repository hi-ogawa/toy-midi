import { useMutation } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { audioManager } from "../lib/audio";
import { BASS_TRANSCRIBE_PARAMS, basicPitchClient } from "../lib/basic-pitch";
import { midiToNoteName } from "../lib/music";
import {
  type AudioTrack,
  generateNoteId,
  secondsToBeats,
  useProjectStore,
} from "../stores/project-store";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Slider } from "./ui/slider";

export function AudioToMidiModal({
  track,
  onClose,
}: {
  track: AudioTrack;
  onClose: () => void;
}) {
  const [params, setParams] = useState(BASS_TRANSCRIBE_PARAMS);
  const [progress, setProgress] = useState<number | null>(null);

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      const buffer = audioManager.getAudioTrackBuffer(track.id);
      if (!buffer) {
        throw new Error("Audio is still loading");
      }
      const transcribed = await basicPitchClient.transcribe(
        track.assetKey,
        buffer,
        params,
        setProgress,
      );
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
    onSuccess: (noteCount) => {
      toast.success(`Replaced notes with ${noteCount} transcribed notes`);
    },
    onError: (error) => {
      console.error("Failed to transcribe audio:", error);
      toast.error("Failed to transcribe audio");
    },
    onSettled: () => setProgress(null),
  });

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="Audio to MIDI"
      testId="audio-to-midi-modal"
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300 truncate" title={track.fileName}>
          {track.fileName}
        </p>

        <ThresholdSlider
          label="Frame threshold (higher = fewer notes)"
          value={params.frameThreshold}
          onChange={(frameThreshold) =>
            setParams({ ...params, frameThreshold })
          }
        />
        <ThresholdSlider
          label="Onset threshold (higher = fewer splits)"
          value={params.onsetThreshold}
          onChange={(onsetThreshold) =>
            setParams({ ...params, onsetThreshold })
          }
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
            value={params.minNoteLengthMs}
            onChange={(e) =>
              setParams({ ...params, minNoteLengthMs: Number(e.target.value) })
            }
            className="w-20 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
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
              value={params.minPitchMidi}
              onChange={(e) =>
                setParams({ ...params, minPitchMidi: Number(e.target.value) })
              }
              className="w-16 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
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
              value={params.maxPitchMidi}
              onChange={(e) =>
                setParams({ ...params, maxPitchMidi: Number(e.target.value) })
              }
              className="w-16 h-8 px-2 text-sm text-right bg-neutral-900 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
            />
            <span className="w-8 tabular-nums">
              {midiToNoteName(params.maxPitchMidi)}
            </span>
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Replaces all MIDI notes (undoable). Re-running with tweaked parameters
          reuses the cached analysis, so only the first run is slow.
        </p>

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setParams(BASS_TRANSCRIBE_PARAMS)}
            className="h-8 px-3 text-sm text-neutral-300 hover:bg-accent"
          >
            Reset
          </Button>
          <Button
            data-testid="transcribe-button"
            onClick={() => transcribeMutation.mutate()}
            disabled={transcribeMutation.isPending}
            className="h-8 gap-1.5 px-3 bg-primary text-sm text-primary-foreground hover:bg-primary/90"
          >
            <SparklesIcon className="size-4" />
            {transcribeMutation.isPending
              ? progress !== null
                ? `Transcribing ${Math.round(progress * 100)}%`
                : "Transcribing..."
              : "Transcribe"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1 text-xs text-neutral-400">
        <label>{label}</label>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={0.05}
        max={0.95}
        step={0.05}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
