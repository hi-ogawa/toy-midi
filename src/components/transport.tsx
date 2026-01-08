import { useCallback, useEffect, useRef } from "react";
import { audioManager } from "../lib/audio";
import { useProjectStore } from "../stores/project-store";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function Transport() {
  const {
    audioFileName,
    audioDuration,
    isPlaying,
    playheadPosition,
    setAudioFile,
    setIsPlaying,
    setPlayheadPosition,
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);

  // Position tracking loop
  const updatePosition = useCallback(() => {
    if (audioManager.isPlaying) {
      setPlayheadPosition(audioManager.position);
      rafRef.current = requestAnimationFrame(updatePosition);
    }
  }, [setPlayheadPosition]);

  // Start/stop position tracking when play state changes
  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updatePosition);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, updatePosition]);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const duration = await audioManager.loadAudio(file);
      setAudioFile(file.name, duration);
      setPlayheadPosition(0);
    } catch (err) {
      console.error("Failed to load audio:", err);
    }

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handlePlayPause = async () => {
    if (!audioManager.loaded) return;

    if (isPlaying) {
      audioManager.pause();
      setIsPlaying(false);
    } else {
      audioManager.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioManager.stop();
    setIsPlaying(false);
    setPlayheadPosition(0);
  };

  // Use audioDuration > 0 as proxy for loaded state (reactive)
  const audioLoaded = audioDuration > 0;

  return (
    <div
      data-testid="transport"
      className="flex items-center gap-3 px-4 py-2 bg-neutral-800 border-b border-neutral-700"
    >
      {/* Load button */}
      <button
        data-testid="load-audio-button"
        onClick={handleLoadClick}
        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 rounded"
      >
        Load Audio
      </button>
      <input
        data-testid="audio-file-input"
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Play/Pause button */}
      <button
        data-testid="play-pause-button"
        onClick={handlePlayPause}
        disabled={!audioLoaded}
        className="w-10 h-10 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        {isPlaying ? (
          <span className="text-lg">⏸</span>
        ) : (
          <span className="text-lg">▶</span>
        )}
      </button>

      {/* Stop button */}
      <button
        data-testid="stop-button"
        onClick={handleStop}
        disabled={!audioLoaded}
        className="w-10 h-10 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        <span className="text-lg">⏹</span>
      </button>

      {/* Time display */}
      <div
        data-testid="time-display"
        className="font-mono text-sm text-neutral-300 min-w-[100px]"
      >
        {formatTime(playheadPosition)} / {formatTime(audioDuration)}
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
    </div>
  );
}
