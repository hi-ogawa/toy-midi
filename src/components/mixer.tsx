import { MusicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
import {
  MAX_DB,
  MIN_DB,
  dbToGain,
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
  const formatDb = useCallback((value: number) => value.toFixed(1), []);
  const midiDbInput = useDraftInput({
    value: gainToDb(midiVolume),
    onCommit: (db) => setMidiVolume(dbToGain(db)),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });
  const audioDbInput = useDraftInput({
    value: gainToDb(audioVolume),
    onCommit: (db) => setAudioVolume(dbToGain(db)),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });
  const metronomeDbInput = useDraftInput({
    value: gainToDb(metronomeVolume),
    onCommit: (db) => setMetronomeVolume(dbToGain(db)),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });

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
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <input
            type="text"
            inputMode="decimal"
            aria-label="MIDI level in dB"
            className="w-12 h-6 px-1 text-xs font-mono bg-input border border-border rounded text-center text-foreground"
            {...midiDbInput.props}
          />
          <span>dB</span>
        </div>
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
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Audio level in dB"
            className="w-12 h-6 px-1 text-xs font-mono bg-input border border-border rounded text-center text-foreground"
            {...audioDbInput.props}
          />
          <span>dB</span>
        </div>
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
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Metronome level in dB"
            className="w-12 h-6 px-1 text-xs font-mono bg-input border border-border rounded text-center text-foreground"
            {...metronomeDbInput.props}
          />
          <span>dB</span>
        </div>
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
