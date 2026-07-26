import { GaugeIcon, MusicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
import {
  MAX_DB,
  MIN_DB,
  dbToGain,
  dbToPercent,
  gainToDb,
  gainToPercent,
  percentToGain,
} from "../lib/music";
import { type AudioTrack, useProjectStore } from "../lib/project-store";
import { MetronomeIcon } from "./icons";
import { Slider } from "./ui/slider";
import { Toggle } from "./ui/toggle";
import { cn } from "./ui/utils";

export function Mixer() {
  const {
    masterVolume,
    midiVolume,
    metronomeVolume,
    midiMuted,
    metronomeEnabled,
    audioTracks,
    setMasterVolume,
    setMidiVolume,
    setMetronomeVolume,
    setMidiMuted,
    setMetronomeEnabled,
  } = useProjectStore();
  const zeroDbPercent = dbToPercent(0);
  const formatDb = useCallback((value: number) => value.toFixed(1), []);
  const masterDbInput = useDraftInput({
    value: gainToDb(masterVolume),
    onCommit: (db) => setMasterVolume(dbToGain(db)),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });
  const midiDbInput = useDraftInput({
    value: gainToDb(midiVolume),
    onCommit: (db) => setMidiVolume(dbToGain(db)),
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
    <div className="flex justify-center gap-8 py-1">
      <MixerChannel
        icon={<GaugeIcon className="size-4 text-muted-foreground" />}
        label="Master"
        volume={masterVolume}
        onVolumeChange={setMasterVolume}
        dbInputProps={masterDbInput.props}
        sliderTestId="mixer-master-volume-slider"
        zeroDbPercent={zeroDbPercent}
      />

      {/* Audio Channels (one per loaded track) */}
      {audioTracks.map((track, index) => (
        <AudioMixerChannel
          key={track.id}
          track={track}
          label={audioTracks.length > 1 ? `Audio ${index + 1}` : "Audio"}
          zeroDbPercent={zeroDbPercent}
          formatDb={formatDb}
        />
      ))}

      <MixerChannel
        icon={<MusicIcon className="size-4 text-muted-foreground" />}
        label="MIDI"
        volume={midiVolume}
        onVolumeChange={setMidiVolume}
        dbInputProps={midiDbInput.props}
        zeroDbPercent={zeroDbPercent}
        action={
          <Toggle
            value={midiMuted}
            onChange={setMidiMuted}
            aria-label="Toggle MIDI mute"
            title={midiMuted ? "Unmute MIDI" : "Mute MIDI"}
            className={cn(
              "h-8 min-w-8 px-1.5",
              midiMuted &&
                "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300",
            )}
          >
            <VolumeXIcon className="size-4" />
          </Toggle>
        }
      />

      <MixerChannel
        icon={<MetronomeIcon className="size-4 text-muted-foreground" />}
        label="Metro"
        volume={metronomeVolume}
        onVolumeChange={setMetronomeVolume}
        dbInputProps={metronomeDbInput.props}
        zeroDbPercent={zeroDbPercent}
        className="border-l border-neutral-700 pl-8"
        action={
          <Toggle
            value={!metronomeEnabled}
            onChange={(muted) => setMetronomeEnabled(!muted)}
            aria-label="Toggle metronome mute"
            title={metronomeEnabled ? "Mute metronome" : "Unmute metronome"}
            className={cn(
              "h-8 min-w-8 px-1.5",
              !metronomeEnabled &&
                "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300",
            )}
          >
            <VolumeXIcon className="size-4" />
          </Toggle>
        }
      />
    </div>
  );
}

// Single audio track channel strip (own dB draft-input hook per track)
function AudioMixerChannel({
  track,
  label,
  zeroDbPercent,
  formatDb,
}: {
  track: AudioTrack;
  label: string;
  zeroDbPercent: number;
  formatDb: (value: number) => string;
}) {
  const updateAudioTrack = useProjectStore((s) => s.updateAudioTrack);
  const dbInput = useDraftInput({
    value: gainToDb(track.volume),
    onCommit: (db) => updateAudioTrack(track.id, { volume: dbToGain(db) }),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });

  return (
    <MixerChannel
      icon={<Volume2Icon className="size-4 text-muted-foreground" />}
      label={label}
      labelTitle={track.fileName}
      volume={track.volume}
      onVolumeChange={(volume) => updateAudioTrack(track.id, { volume })}
      dbInputProps={dbInput.props}
      zeroDbPercent={zeroDbPercent}
      action={
        <Toggle
          value={track.muted}
          onChange={(muted) => updateAudioTrack(track.id, { muted })}
          aria-label={`Toggle ${label} mute`}
          title={track.muted ? `Unmute ${label}` : `Mute ${label}`}
          className={cn(
            "h-8 min-w-8 px-1.5",
            track.muted &&
              "bg-red-900/50 border-red-700 text-red-400 hover:bg-red-900/70 hover:text-red-300",
          )}
        >
          <VolumeXIcon className="size-4" />
        </Toggle>
      }
    />
  );
}

function MixerChannel({
  icon,
  label,
  labelTitle,
  volume,
  onVolumeChange,
  dbInputProps,
  zeroDbPercent,
  action,
  sliderTestId,
  className,
}: {
  icon: ReactNode;
  label: string;
  labelTitle?: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  dbInputProps: ComponentProps<"input">;
  zeroDbPercent: number;
  action?: ReactNode;
  sliderTestId?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-24 flex-col items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <label
          className="max-w-24 truncate text-xs font-medium text-neutral-300"
          title={labelTitle}
        >
          {label}
        </label>
      </div>
      <div className="relative h-48">
        <div
          className="pointer-events-none absolute left-1/2 h-px w-3 -translate-x-1/2 bg-neutral-500/70"
          style={{ bottom: `${zeroDbPercent}%` }}
        />
        <Slider
          data-testid={sliderTestId}
          value={[gainToPercent(volume)]}
          onValueChange={([value]) => onVolumeChange(percentToGain(value))}
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
          aria-label={`${label === "Metro" ? "Metronome" : label} level in dB`}
          className="w-12 h-6 px-1 text-xs font-mono bg-input border border-border rounded text-center text-foreground"
          {...dbInputProps}
        />
        <span>dB</span>
      </div>
      {action ?? <div className="h-8" />}
    </div>
  );
}
