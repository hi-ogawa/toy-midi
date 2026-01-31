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
    <div className="flex justify-center gap-8 py-4">
      {/* MIDI Channel */}
      <div className="flex flex-col items-center gap-3 min-w-24">
        <div className="flex items-center gap-2">
          <MusicIcon className="size-4 text-muted-foreground" />
          <label className="text-xs font-medium text-neutral-300">MIDI</label>
        </div>
        <Slider
          value={[midiVolume * 100]}
          onValueChange={([v]) => setMidiVolume(v / 100)}
          max={100}
          step={1}
          orientation="vertical"
          className="h-48"
          disabled={midiMuted}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(midiVolume * 100)}%
        </span>
        <Toggle
          pressed={midiMuted}
          onPressedChange={setMidiMuted}
          aria-label="Toggle MIDI mute"
          title={midiMuted ? "Unmute MIDI" : "Mute MIDI"}
          size="sm"
          variant="outline"
          className={
            midiMuted
              ? "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300 data-[state=on]:bg-red-900/50 data-[state=on]:text-red-400"
              : ""
          }
        >
          <VolumeXIcon className="size-4" />
        </Toggle>
      </div>

      {/* Audio Channel */}
      <div className="flex flex-col items-center gap-3 min-w-24">
        <div className="flex items-center gap-2">
          <Volume2Icon className="size-4 text-muted-foreground" />
          <label className="text-xs font-medium text-neutral-300">Audio</label>
        </div>
        <Slider
          value={[audioVolume * 100]}
          onValueChange={([v]) => setAudioVolume(v / 100)}
          max={100}
          step={1}
          orientation="vertical"
          className="h-48"
          disabled={audioMuted}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(audioVolume * 100)}%
        </span>
        <Toggle
          pressed={audioMuted}
          onPressedChange={setAudioMuted}
          aria-label="Toggle audio mute"
          title={audioMuted ? "Unmute audio" : "Mute audio"}
          size="sm"
          variant="outline"
          className={
            audioMuted
              ? "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300 data-[state=on]:bg-red-900/50 data-[state=on]:text-red-400"
              : ""
          }
        >
          <VolumeXIcon className="size-4" />
        </Toggle>
      </div>

      {/* Metronome Channel */}
      <div className="flex flex-col items-center gap-3 min-w-24">
        <div className="flex items-center gap-2">
          <MetronomeIcon className="size-4 text-muted-foreground" />
          <label className="text-xs font-medium text-neutral-300">Metro</label>
        </div>
        <Slider
          value={[metronomeVolume * 100]}
          onValueChange={([v]) => setMetronomeVolume(v / 100)}
          max={100}
          step={1}
          orientation="vertical"
          className="h-48"
          disabled={!metronomeEnabled}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(metronomeVolume * 100)}%
        </span>
        <Toggle
          pressed={!metronomeEnabled}
          onPressedChange={(muted) => setMetronomeEnabled(!muted)}
          aria-label="Toggle metronome mute"
          title={metronomeEnabled ? "Mute metronome" : "Unmute metronome"}
          size="sm"
          variant="outline"
          className={
            !metronomeEnabled
              ? "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300 data-[state=on]:bg-red-900/50 data-[state=on]:text-red-400"
              : ""
          }
        >
          <VolumeXIcon className="size-4" />
        </Toggle>
      </div>
    </div>
  );
}
