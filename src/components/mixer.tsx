import { MusicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useProjectStore } from "../stores/project-store";
import { MetronomeIcon } from "./icons";
import { Slider } from "./ui/slider";
import { Toggle } from "./ui/toggle";

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
