import { useMutation } from "@tanstack/react-query";
import {
  CircleHelpIcon,
  ClipboardIcon,
  DownloadIcon,
  FolderIcon,
  MusicIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  Volume2Icon,
} from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTransport } from "../hooks/use-transport";
import { useWindowEvent } from "../hooks/use-window-event";
import {
  copyABCToClipboard,
  downloadABCFile,
  exportABC,
} from "../lib/abc-export";
import { deleteAsset, saveAsset } from "../lib/asset-store";
import { audioManager, GM_PROGRAMS, loadAudioFile } from "../lib/audio";
import { downloadMidiFile, exportMidi } from "../lib/midi-export";
import { useProjectStore } from "../stores/project-store";
import { COMMON_TIME_SIGNATURES, type GridSnap } from "../types";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";

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

function formatTimeCompact(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(hundredths).padStart(2, "0")}`;
}

function formatBarBeat(seconds: number, tempo: number): string {
  const beatsPerSecond = tempo / 60;
  const totalBeats = seconds * beatsPerSecond;
  const bar = Math.floor(totalBeats / 4) + 1; // 4/4 time signature
  const beatInBar = Math.floor(totalBeats % 4) + 1;
  return `${String(bar).padStart(2, "0")}|${String(beatInBar).padStart(2, "0")}`;
}

type TransportProps = {
  onHelpClick: () => void;
  onProjectsClick: () => void;
  onRenameProject: () => void;
};

export function Transport({
  onHelpClick,
  onProjectsClick,
  onRenameProject,
}: TransportProps) {
  const {
    audioFileName,
    audioAssetKey,
    tempo,
    timeSignature,
    notes,
    midiVolume,
    midiProgram,
    audioVolume,
    metronomeVolume,
    metronomeEnabled,
    autoScrollEnabled,
    gridSnap,
    showDebug,
    setTempo,
    setTimeSignature,
    setMidiVolume,
    setMidiProgram,
    setAudioVolume,
    setMetronomeVolume,
    setMetronomeEnabled,
    setAutoScrollEnabled,
    setGridSnap,
    setShowDebug,
    setAudioFile,
    setAudioOffset,
    setAudioPeaks,
    clearAudioFile,
  } = useProjectStore();

  // Transport state from hook (source of truth: Tone.js Transport)
  const { isPlaying, position } = useTransport();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  const loadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const { buffer, peaks, peaksPerSecond } = await loadAudioFile(file);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);
      setAudioFile(file.name, buffer.duration, assetKey);

      audioManager.player.buffer = buffer;
      audioManager.player.sync().start(0);
      setAudioOffset(0);

      setAudioPeaks(peaks, peaksPerSecond);
    },
  });

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAudioMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleRemoveAudio = async () => {
    // Delete from IndexedDB if we have a key
    if (audioAssetKey) {
      await deleteAsset(audioAssetKey);
    }
    // Clear the audio buffer in the player
    audioManager.clearAudioBuffer();
    // Clear store state
    clearAudioFile();
  };

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioManager.pause();
    } else {
      audioManager.play();
    }
  }, [isPlaying]);

  const handleAutoScrollToggle = useCallback(() => {
    setAutoScrollEnabled(!autoScrollEnabled);
  }, [autoScrollEnabled, setAutoScrollEnabled]);

  // Keyboard shortcuts: Space=play/pause, Ctrl+F=auto-scroll
  useWindowEvent("keydown", (e) => {
    // Don't trigger if typing in an input
    if (
      (e.target instanceof HTMLInputElement && e.target.type !== "range") ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      handlePlayPause();
    } else if (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.repeat) {
      e.preventDefault();
      handleAutoScrollToggle();
    }
  });

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    // Reset if last tap was more than 2 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    // Keep only last 8 taps
    if (taps.length > 8) {
      taps.shift();
    }

    // Need at least 2 taps to calculate BPM
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);

      // Clamp to valid range
      if (bpm >= 30 && bpm <= 300) {
        setTempo(bpm);
      }
    }
  };

  const handleExportMidi = () => {
    const midiData = exportMidi({
      notes,
      tempo,
      timeSignature,
      trackName: audioFileName
        ? audioFileName.replace(/\.[^.]+$/, "")
        : "Piano Roll",
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, "-")
      .replace(/\.\d+Z$/, "");
    const fileName = `toy-midi-export-${timestamp}.mid`;

    downloadMidiFile(midiData, fileName);
  };

  const handleExportABC = () => {
    const abcText = exportABC({
      notes,
      tempo,
      timeSignature,
      title: audioFileName ? audioFileName.replace(/\.[^.]+$/, "") : "Untitled",
    });

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[T:]/g, "-")
      .replace(/\.\d+Z$/, "");
    const fileName = `toy-midi-export-${timestamp}.abc`;

    downloadABCFile(abcText, fileName);
  };

  const handleCopyABCToClipboard = async () => {
    try {
      const abcText = exportABC({
        notes,
        tempo,
        timeSignature,
        title: audioFileName
          ? audioFileName.replace(/\.[^.]+$/, "")
          : "Untitled",
      });

      await copyABCToClipboard(abcText);
      toast.success("ABC notation copied to clipboard");
    } catch (error) {
      console.error("Failed to copy ABC notation:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div
      data-testid="transport"
      className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700"
    >
      {/* Hidden file input */}
      <input
        data-testid="audio-file-input"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Play/Pause button */}
      <Button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        variant={isPlaying ? "default" : "ghost"}
        size="icon"
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <PauseIcon data-testid="pause-icon" className="size-5" />
        ) : (
          <PlayIcon data-testid="play-icon" className="size-5" />
        )}
      </Button>

      {/* Metronome toggle */}
      <Button
        data-testid="metronome-toggle"
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        variant={metronomeEnabled ? "default" : "ghost"}
        size="icon"
        title="Toggle metronome"
        aria-pressed={metronomeEnabled}
      >
        <MetronomeIcon className="size-5" />
      </Button>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time display: Bar|Beat - MM:SS.frac */}
      <div
        data-testid="time-display"
        className="font-mono text-muted-foreground tabular-nums"
      >
        {formatBarBeat(position, tempo)} - {formatTimeCompact(position)}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Tempo: BPM input + tap button + time signature */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">BPM:</span>
        <input
          data-testid="tempo-input"
          type="number"
          min={30}
          max={300}
          value={tempo}
          onChange={(e) => {
            const value = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(value)) {
              setTempo(value);
            }
          }}
          onBlur={(e) => {
            const value = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(value)) {
              setTempo(Math.min(300, Math.max(30, value)));
            }
          }}
          className="w-14 h-8 px-1 text-sm font-mono bg-input border border-border rounded text-center text-foreground"
        />
        <Button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          variant="ghost"
          size="sm"
          title="Tap tempo"
          className="text-xs px-1.5"
        >
          TAP
        </Button>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Time signature selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="time-signature-select"
            variant="ghost"
            size="sm"
            className="gap-1 font-mono"
          >
            {timeSignature.numerator}/{timeSignature.denominator}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={`${timeSignature.numerator}/${timeSignature.denominator}`}
            onValueChange={(v) => {
              const [numerator, denominator] = v.split("/").map(Number);
              setTimeSignature({ numerator, denominator });
            }}
          >
            {COMMON_TIME_SIGNATURES.map((ts) => (
              <DropdownMenuRadioItem
                key={`${ts.numerator}/${ts.denominator}`}
                value={`${ts.numerator}/${ts.denominator}`}
              >
                {ts.numerator}/{ts.denominator}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Grid snap selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="grid-snap-select"
            variant="ghost"
            size="sm"
            className="gap-1 font-mono"
          >
            {gridSnap}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={gridSnap}
            onValueChange={(v) => setGridSnap(v as GridSnap)}
          >
            <DropdownMenuRadioItem value="1/4">1/4</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/8">1/8</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/16">1/16</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/4T">1/4T</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/8T">1/8T</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="1/16T">1/16T</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Divider */}
      <div className="w-px h-5 bg-border" />

      {/* Instrument selector */}
      <Select
        value={String(midiProgram)}
        onValueChange={(v) => setMidiProgram(Number(v))}
      >
        <SelectTrigger
          data-testid="instrument-select"
          className="h-8 w-44 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="max-h-64 [&>[data-slot=select-scroll-up-button]]:hidden [&>[data-slot=select-scroll-down-button]]:hidden"
        >
          <SelectGroup>
            <SelectLabel>Piano</SelectLabel>
            {GM_PROGRAMS.slice(0, 8).map((name, i) => (
              <SelectItem key={i} value={String(i)} className="text-xs">
                {i}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Chromatic Percussion</SelectLabel>
            {GM_PROGRAMS.slice(8, 16).map((name, i) => (
              <SelectItem key={i + 8} value={String(i + 8)} className="text-xs">
                {i + 8}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Organ</SelectLabel>
            {GM_PROGRAMS.slice(16, 24).map((name, i) => (
              <SelectItem
                key={i + 16}
                value={String(i + 16)}
                className="text-xs"
              >
                {i + 16}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Guitar</SelectLabel>
            {GM_PROGRAMS.slice(24, 32).map((name, i) => (
              <SelectItem
                key={i + 24}
                value={String(i + 24)}
                className="text-xs"
              >
                {i + 24}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Bass</SelectLabel>
            {GM_PROGRAMS.slice(32, 40).map((name, i) => (
              <SelectItem
                key={i + 32}
                value={String(i + 32)}
                className="text-xs"
              >
                {i + 32}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Strings</SelectLabel>
            {GM_PROGRAMS.slice(40, 48).map((name, i) => (
              <SelectItem
                key={i + 40}
                value={String(i + 40)}
                className="text-xs"
              >
                {i + 40}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Ensemble</SelectLabel>
            {GM_PROGRAMS.slice(48, 56).map((name, i) => (
              <SelectItem
                key={i + 48}
                value={String(i + 48)}
                className="text-xs"
              >
                {i + 48}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Brass</SelectLabel>
            {GM_PROGRAMS.slice(56, 64).map((name, i) => (
              <SelectItem
                key={i + 56}
                value={String(i + 56)}
                className="text-xs"
              >
                {i + 56}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Reed</SelectLabel>
            {GM_PROGRAMS.slice(64, 72).map((name, i) => (
              <SelectItem
                key={i + 64}
                value={String(i + 64)}
                className="text-xs"
              >
                {i + 64}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Pipe</SelectLabel>
            {GM_PROGRAMS.slice(72, 80).map((name, i) => (
              <SelectItem
                key={i + 72}
                value={String(i + 72)}
                className="text-xs"
              >
                {i + 72}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Synth Lead</SelectLabel>
            {GM_PROGRAMS.slice(80, 88).map((name, i) => (
              <SelectItem
                key={i + 80}
                value={String(i + 80)}
                className="text-xs"
              >
                {i + 80}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Synth Pad</SelectLabel>
            {GM_PROGRAMS.slice(88, 96).map((name, i) => (
              <SelectItem
                key={i + 88}
                value={String(i + 88)}
                className="text-xs"
              >
                {i + 88}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Synth Effects</SelectLabel>
            {GM_PROGRAMS.slice(96, 104).map((name, i) => (
              <SelectItem
                key={i + 96}
                value={String(i + 96)}
                className="text-xs"
              >
                {i + 96}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Ethnic</SelectLabel>
            {GM_PROGRAMS.slice(104, 112).map((name, i) => (
              <SelectItem
                key={i + 104}
                value={String(i + 104)}
                className="text-xs"
              >
                {i + 104}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Percussive</SelectLabel>
            {GM_PROGRAMS.slice(112, 120).map((name, i) => (
              <SelectItem
                key={i + 112}
                value={String(i + 112)}
                className="text-xs"
              >
                {i + 112}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Sound Effects</SelectLabel>
            {GM_PROGRAMS.slice(120, 128).map((name, i) => (
              <SelectItem
                key={i + 120}
                value={String(i + 120)}
                className="text-xs"
              >
                {i + 120}: {name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="settings-button"
            variant="ghost"
            size="icon"
            title="Settings"
          >
            <SettingsIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Rename Project */}
          <DropdownMenuItem
            data-testid="rename-project-button"
            onClick={onRenameProject}
          >
            <PencilIcon className="size-4" />
            Rename Project
          </DropdownMenuItem>

          {/* Projects */}
          <DropdownMenuItem
            data-testid="projects-button"
            onClick={onProjectsClick}
          >
            <FolderIcon className="size-4" />
            Projects
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Load Audio */}
          <DropdownMenuItem
            data-testid="load-audio-button"
            onClick={handleLoadClick}
            disabled={loadAudioMutation.isPending}
          >
            <UploadIcon className="size-4" />
            {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
          </DropdownMenuItem>

          {/* Remove Audio */}
          <DropdownMenuItem
            data-testid="remove-audio-button"
            onClick={handleRemoveAudio}
            disabled={!audioFileName}
          >
            <Trash2Icon className="size-4" />
            Remove Audio
          </DropdownMenuItem>

          {/* Export MIDI */}
          <DropdownMenuItem
            data-testid="export-midi-button"
            onClick={handleExportMidi}
            disabled={notes.length === 0}
          >
            <DownloadIcon className="size-4" />
            Export MIDI
          </DropdownMenuItem>

          {/* Export ABC - File */}
          <DropdownMenuItem
            data-testid="export-abc-button"
            onClick={handleExportABC}
            disabled={notes.length === 0}
          >
            <DownloadIcon className="size-4" />
            Export ABC
          </DropdownMenuItem>

          {/* Export ABC - Clipboard */}
          <DropdownMenuItem
            data-testid="copy-abc-button"
            onClick={handleCopyABCToClipboard}
            disabled={notes.length === 0}
          >
            <ClipboardIcon className="size-4" />
            Copy ABC to Clipboard
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Volume sliders */}
          <div className="px-2 py-1.5 flex items-center gap-2">
            <MusicIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">MIDI</span>
            <Slider
              value={[midiVolume * 100]}
              onValueChange={([v]) => setMidiVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>
          <div className="px-2 py-1.5 flex items-center gap-2">
            <Volume2Icon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">Audio</span>
            <Slider
              value={[audioVolume * 100]}
              onValueChange={([v]) => setAudioVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>
          <div className="px-2 py-1.5 flex items-center gap-2">
            <MetronomeIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm w-12">Metro</span>
            <Slider
              value={[metronomeVolume * 100]}
              onValueChange={([v]) => setMetronomeVolume(v / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>

          <DropdownMenuSeparator />

          {/* Auto-scroll toggle */}
          <DropdownMenuCheckboxItem
            data-testid="auto-scroll-toggle"
            checked={autoScrollEnabled}
            onCheckedChange={setAutoScrollEnabled}
            onSelect={(e) => e.preventDefault()}
            aria-pressed={autoScrollEnabled}
          >
            Auto-scroll
            <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>

          {/* Debug toggle */}
          <DropdownMenuCheckboxItem
            data-testid="debug-toggle"
            checked={showDebug}
            onCheckedChange={setShowDebug}
            onSelect={(e) => e.preventDefault()}
          >
            Debug
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help button */}
      <Button
        data-testid="help-button"
        onClick={onHelpClick}
        variant="ghost"
        size="icon"
        title="Show keyboard shortcuts (?)"
      >
        <CircleHelpIcon className="size-5" />
      </Button>
    </div>
  );
}
