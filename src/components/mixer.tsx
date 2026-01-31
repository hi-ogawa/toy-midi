import { MusicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useProjectStore } from "../stores/project-store";
import { Slider } from "./ui/slider";
import { Toggle } from "./ui/toggle";

function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      aria-label="Metronome"
    >
      <title>Metronome</title>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m14.153 8.188l-.72-3.236a2.493 2.493 0 0 0-4.867 0L5.541 18.566A2 2 0 0 0 7.493 21h7.014a2 2 0 0 0 1.952-2.434l-.524-2.357M11 18l9-13m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
      />
    </svg>
  );
}

export function Mixer() {
  const {
    midiVolume,
    audioVolume,
    metronomeVolume,
    midiMuted,
    audioMuted,
    metronomeEnabled,
    setMidiVolume,
    setAudioVolume,
    setMetronomeVolume,
    setMidiMuted,
    setAudioMuted,
    setMetronomeEnabled,
  } = useProjectStore();

  return (
    <div className="space-y-6">
      {/* MIDI Volume */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <MusicIcon className="size-5 text-muted-foreground" />
          <label className="text-sm font-medium text-neutral-300">
            MIDI Volume
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            pressed={midiMuted}
            onPressedChange={setMidiMuted}
            aria-label="Toggle MIDI mute"
            title={midiMuted ? "Unmute MIDI" : "Mute MIDI"}
            size="sm"
            variant="outline"
          >
            <VolumeXIcon className="size-4" />
          </Toggle>
          <Slider
            value={[midiVolume * 100]}
            onValueChange={([v]) => setMidiVolume(v / 100)}
            max={100}
            step={1}
            className="flex-1"
            disabled={midiMuted}
          />
          <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
            {Math.round(midiVolume * 100)}%
          </span>
        </div>
      </div>

      {/* Audio Volume */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Volume2Icon className="size-5 text-muted-foreground" />
          <label className="text-sm font-medium text-neutral-300">
            Audio Volume
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            pressed={audioMuted}
            onPressedChange={setAudioMuted}
            aria-label="Toggle audio mute"
            title={audioMuted ? "Unmute audio" : "Mute audio"}
            size="sm"
            variant="outline"
          >
            <VolumeXIcon className="size-4" />
          </Toggle>
          <Slider
            value={[audioVolume * 100]}
            onValueChange={([v]) => setAudioVolume(v / 100)}
            max={100}
            step={1}
            className="flex-1"
            disabled={audioMuted}
          />
          <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
            {Math.round(audioVolume * 100)}%
          </span>
        </div>
      </div>

      {/* Metronome Volume */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <MetronomeIcon className="size-5 text-muted-foreground" />
          <label className="text-sm font-medium text-neutral-300">
            Metronome Volume
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            pressed={!metronomeEnabled}
            onPressedChange={(muted) => setMetronomeEnabled(!muted)}
            aria-label="Toggle metronome mute"
            title={metronomeEnabled ? "Mute metronome" : "Unmute metronome"}
            size="sm"
            variant="outline"
          >
            <VolumeXIcon className="size-4" />
          </Toggle>
          <Slider
            value={[metronomeVolume * 100]}
            onValueChange={([v]) => setMetronomeVolume(v / 100)}
            max={100}
            step={1}
            className="flex-1"
            disabled={!metronomeEnabled}
          />
          <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
            {Math.round(metronomeVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
