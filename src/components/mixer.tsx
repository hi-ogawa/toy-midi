import { MusicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import {
  dbToPercent,
  gainToDb,
  gainToPercent,
  percentToGain,
} from "../lib/volume";
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
  const zeroDbPercent = dbToPercent(0);

  return (
    <div className="flex justify-center gap-8 py-4">
      {/* MIDI Channel */}
      <div className="flex flex-col items-center gap-3 min-w-24">
        <div className="flex items-center gap-2">
          <MusicIcon className="size-4 text-muted-foreground" />
          <label className="text-xs font-medium text-neutral-300">MIDI</label>
        </div>
        <div className="relative h-48">
          <div
            className="pointer-events-none absolute left-1/2 h-px w-3 -translate-x-1/2 bg-neutral-500/70"
            style={{ bottom: `${zeroDbPercent}%` }}
          />
          <Slider
            value={[gainToPercent(midiVolume)]}
            onValueChange={([v]) => setMidiVolume(percentToGain(v))}
            max={100}
            step={1}
            orientation="vertical"
            className="h-48"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {gainToDb(midiVolume).toFixed(1)} dB
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
        <div className="relative h-48">
          <div
            className="pointer-events-none absolute left-1/2 h-px w-3 -translate-x-1/2 bg-neutral-500/70"
            style={{ bottom: `${zeroDbPercent}%` }}
          />
          <Slider
            value={[gainToPercent(audioVolume)]}
            onValueChange={([v]) => setAudioVolume(percentToGain(v))}
            max={100}
            step={1}
            orientation="vertical"
            className="h-48"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {gainToDb(audioVolume).toFixed(1)} dB
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
        <div className="relative h-48">
          <div
            className="pointer-events-none absolute left-1/2 h-px w-3 -translate-x-1/2 bg-neutral-500/70"
            style={{ bottom: `${zeroDbPercent}%` }}
          />
          <Slider
            value={[gainToPercent(metronomeVolume)]}
            onValueChange={([v]) => setMetronomeVolume(percentToGain(v))}
            max={100}
            step={1}
            orientation="vertical"
            className="h-48"
            disabled={!metronomeEnabled}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {gainToDb(metronomeVolume).toFixed(1)} dB
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
