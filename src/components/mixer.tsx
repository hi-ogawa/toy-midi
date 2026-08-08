import { GaugeIcon, MusicIcon, Volume2Icon } from "lucide-react";
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
    midiSoloed,
    metronomeEnabled,
    audioTracks,
    setMasterVolume,
    setMidiVolume,
    setMetronomeVolume,
    setMidiMuted,
    setMidiSoloed,
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
          <TrackToggles
            label="MIDI"
            muted={midiMuted}
            soloed={midiSoloed}
            onMutedChange={setMidiMuted}
            onSoloedChange={setMidiSoloed}
          />
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
              "h-8 min-w-8 px-1.5 text-xs font-semibold",
              !metronomeEnabled
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground"
                : "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            M
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
        <TrackToggles
          label={label}
          muted={track.muted}
          soloed={track.soloed ?? false}
          onMutedChange={(muted) => updateAudioTrack(track.id, { muted })}
          onSoloedChange={(soloed) => updateAudioTrack(track.id, { soloed })}
        />
      }
    />
  );
}

function TrackToggles({
  label,
  muted,
  soloed,
  onMutedChange,
  onSoloedChange,
}: {
  label: string;
  muted: boolean;
  soloed: boolean;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Toggle
        value={muted}
        onChange={onMutedChange}
        aria-label={`Toggle ${label} mute`}
        title={muted ? `Unmute ${label}` : `Mute ${label}`}
        className={cn(
          "h-8 min-w-8 px-1.5 text-xs font-semibold",
          muted
            ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground"
            : "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        M
      </Toggle>
      <Toggle
        value={soloed}
        onChange={onSoloedChange}
        aria-label={`Toggle ${label} solo`}
        title={soloed ? `Disable ${label} solo` : `Solo ${label}`}
        className={cn(
          "h-8 min-w-8 px-1.5 text-xs font-semibold",
          soloed
            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            : "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        S
      </Toggle>
    </div>
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
