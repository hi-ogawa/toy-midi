import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";

/**
 * Hook that provides reactive transport state from Tone.js Transport.
 *
 * Returns:
 * - isPlaying: whether transport is playing
 * - position: current position in seconds (updates at 60fps during playback)
 *
 * Control methods (play/pause/stop/seek) are on audioManager,
 * which handles app-specific logic like note scheduling.
 */
export function useTransport() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const transport = Tone.getTransport();

    // Sync initial state
    setIsPlaying(transport.state === "started");
    setPosition(transport.seconds);

    // Subscribe to Transport state changes
    const handleStart = () => {
      setIsPlaying(true);
      // Start RAF loop for smooth position updates
      const updatePosition = () => {
        setPosition(Tone.getTransport().seconds);
        rafRef.current = requestAnimationFrame(updatePosition);
      };
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    const handleStop = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setPosition(Tone.getTransport().seconds);
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setPosition(Tone.getTransport().seconds);
    };

    transport.on("start", handleStart);
    transport.on("stop", handleStop);
    transport.on("pause", handlePause);

    return () => {
      transport.off("start", handleStart);
      transport.off("stop", handleStop);
      transport.off("pause", handlePause);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isPlaying, position };
}
