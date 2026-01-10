import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { saveAsset } from "../lib/asset-store";
import { audioManager } from "../lib/audio";
import { useProjectStore } from "../stores/project-store";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type TransportProps = {
  onHelpClick: () => void;
};

export function Transport({ onHelpClick }: TransportProps) {
  const {
    audioFileName,
    audioDuration,
    isPlaying,
    playheadPosition,
    tempo,
    notes,
    audioVolume,
    midiVolume,
    metronomeEnabled,
    metronomeVolume,
    setAudioFile,
    setIsPlaying,
    setPlayheadPosition,
    setTempo,
    setAudioVolume,
    setMidiVolume,
    setMetronomeEnabled,
    setAudioPeaks,
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Subscribe to AudioManager state changes (single source of truth)
  useEffect(() => {
    const unsubscribe = audioManager.subscribe((event) => {
      if (event.type === "playStateChanged") {
        setIsPlaying(event.isPlaying);
      } else if (event.type === "positionChanged") {
        setPlayheadPosition(event.position);
      }
    });

    return unsubscribe;
  }, [setIsPlaying, setPlayheadPosition]);

  // Reactively sync volume settings with AudioManager when store changes
  useEffect(() => {
    audioManager.setAudioVolume(audioVolume);
  }, [audioVolume]);

  useEffect(() => {
    audioManager.setMidiVolume(midiVolume);
  }, [midiVolume]);

  useEffect(() => {
    audioManager.setMetronomeEnabled(metronomeEnabled);
  }, [metronomeEnabled]);

  useEffect(() => {
    audioManager.setMetronomeVolume(metronomeVolume);
  }, [metronomeVolume]);

  // Dynamically update scheduled notes when notes or tempo change during playback
  useEffect(() => {
    if (isPlaying) {
      audioManager.updateNotesWhilePlaying(notes, tempo);
    }
  }, [notes, tempo, isPlaying]);

  const loadAudioMutation = useMutation({
    mutationFn: async (file: File) => {
      const duration = await audioManager.loadAudio(file);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);

      setAudioFile(file.name, duration, assetKey);
      setPlayheadPosition(0);

      // Extract peaks for waveform display
      const peaksPerSecond = 100;
      const peaks = audioManager.getPeaks(peaksPerSecond);
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

  // Note: audioManager.init() is called in App.tsx on startup screen click
  // Volume sync is handled by reactive effects above

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioManager.pause();
      audioManager.clearScheduledNotes();
    } else {
      // Schedule MIDI notes from current position
      audioManager.scheduleNotes(notes, audioManager.position, tempo);
      audioManager.play();
    }
  }, [isPlaying, notes, tempo]);

  // Space key to toggle play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // Don't trigger if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause]);

  // Use audioDuration > 0 as proxy for loaded state (reactive)
  const audioLoaded = audioDuration > 0;

  const handleAudioVolumeChange = (value: number) => {
    setAudioVolume(value);
    // AudioManager sync happens via useEffect above
  };

  const handleMidiVolumeChange = (value: number) => {
    setMidiVolume(value);
    // AudioManager sync happens via useEffect above
  };

  const handleMetronomeToggle = () => {
    const newValue = !metronomeEnabled;
    setMetronomeEnabled(newValue);
    // AudioManager sync happens via useEffect above
  };

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

  return (
    <div
      data-testid="transport"
      className="flex items-center gap-3 px-4 py-2 bg-neutral-800 border-b border-neutral-700"
    >
      {/* Load button */}
      <button
        data-testid="load-audio-button"
        onClick={handleLoadClick}
        disabled={loadAudioMutation.isPending}
        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 rounded disabled:opacity-50"
      >
        {loadAudioMutation.isPending ? "Loading..." : "Load Audio"}
      </button>
      <input
        data-testid="audio-file-input"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Play/Pause button - always enabled for MIDI-only mode */}
      <button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        className="w-10 h-10 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded"
      >
        {isPlaying ? (
          <span className="text-lg">⏸</span>
        ) : (
          <span className="text-lg">▶</span>
        )}
      </button>

      {/* Time display */}
      <div
        data-testid="time-display"
        className="font-mono text-sm text-neutral-300 min-w-[100px]"
      >
        {formatTime(playheadPosition)} / {formatTime(audioDuration)}
      </div>

      {/* Tempo input */}
      <div className="flex items-center gap-1">
        <input
          data-testid="tempo-input"
          type="number"
          min={30}
          max={300}
          value={tempo}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
              // Accept any value during typing, clamp on blur
              setTempo(value);
            }
          }}
          onBlur={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value)) {
              setTempo(Math.min(300, Math.max(30, value)));
            }
          }}
          className="w-14 px-1 py-0.5 text-sm font-mono bg-neutral-700 border border-neutral-600 rounded text-center"
        />
        <span className="text-xs text-neutral-400">BPM</span>
        <button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          className="px-2 py-0.5 text-xs bg-neutral-700 hover:bg-neutral-600 rounded"
          title="Tap to set tempo"
        >
          Tap
        </button>
      </div>

      {/* File name */}
      {audioFileName && (
        <span
          data-testid="audio-file-name"
          className="text-sm text-neutral-400 truncate max-w-[200px]"
        >
          {audioFileName}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mixer controls */}
      <div className="flex items-center gap-3">
        {/* Audio volume */}
        {audioLoaded && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500">Audio</span>
            <input
              type="range"
              min={0}
              max={100}
              value={audioVolume * 100}
              onChange={(e) =>
                handleAudioVolumeChange(parseInt(e.target.value, 10) / 100)
              }
              className="w-16 h-1 accent-neutral-400"
            />
          </div>
        )}

        {/* MIDI volume */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">MIDI</span>
          <input
            type="range"
            min={0}
            max={100}
            value={midiVolume * 100}
            onChange={(e) =>
              handleMidiVolumeChange(parseInt(e.target.value, 10) / 100)
            }
            className="w-16 h-1 accent-neutral-400"
          />
        </div>

        {/* Metronome toggle */}
        <button
          data-testid="metronome-toggle"
          onClick={handleMetronomeToggle}
          aria-pressed={metronomeEnabled}
          className={`px-2 py-1 text-xs rounded ${
            metronomeEnabled
              ? "bg-emerald-600 text-white"
              : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
          }`}
          title="Toggle metronome"
        >
          Metro
        </button>

        {/* Help button */}
        <button
          data-testid="help-button"
          onClick={onHelpClick}
          className="w-6 h-6 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-400 hover:text-neutral-200 text-sm font-bold"
          title="Show keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </div>
  );
}
