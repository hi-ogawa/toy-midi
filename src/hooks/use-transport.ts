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
  // TODO:
  // expose high frequency update should as a separate hook?
  // or we should allow selector function to subscribe only partial state e.g.
  // useTransport(s => s.isPlaying)
  // useTransport(s => s.position)
  // cf. tanstack router useRouter and use-sync-external-store/with-selector

  const [transportState, setTransportState] = useState(() => deriveState());
  const rafRef = useRef<number>(null);

  useEffect(() => {
    function handler() {
      const state = deriveState();
      setTransportState(state);
      if (state.isPlaying && rafRef.current === null) {
        // Start RAF loop for smooth position updates
        const updatePosition = () => {
          setTransportState(deriveState());
          rafRef.current = requestAnimationFrame(updatePosition);
        };
        rafRef.current = requestAnimationFrame(updatePosition);
      }
      if (!state.isPlaying && rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    const disposes: (() => void)[] = [];

    for (const e of TRANSPORT_EVENT_NAMES) {
      Tone.getTransport().on(e, handler);
      disposes.push(() => Tone.getTransport().off(e, handler));
    }

    // Listen for seek events (fired by audioManager.seek())
    const seekHandler = () => setTransportState(deriveState());
    window.addEventListener("transport-seek", seekHandler);

    return () => {
      for (const dispose of disposes) {
        dispose();
      }
      window.removeEventListener("transport-seek", seekHandler);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return transportState;
}

// from Tone.js TransportEventNames type
const TRANSPORT_EVENT_NAMES = [
  "start",
  "stop",
  "pause",
  "loop",
  "loopEnd",
  "loopStart",
  "ticks",
] as const;

type TransportState = {
  isPlaying: boolean;
  position: number;
};

function deriveState(): TransportState {
  const transport = Tone.getTransport();
  return {
    isPlaying: transport.state === "started",
    position: transport.seconds,
  };
}
