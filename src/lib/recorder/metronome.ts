const CLICK_DURATION_SECONDS = 0.03;

export type MetronomeEvent = {
  accent: boolean;
  position: number;
};

export function getMetronomeEvents({
  from,
  tempo,
  to,
}: {
  from: number;
  tempo: number;
  to: number;
}): MetronomeEvent[] {
  const secondsPerBeat = 60 / tempo;
  const firstBeat = Math.ceil(from / secondsPerBeat - 1e-9);
  const lastBeat = Math.ceil(to / secondsPerBeat) - 1;
  return Array.from(
    { length: Math.max(0, lastBeat - firstBeat + 1) },
    (_, index) => {
      const beat = firstBeat + index;
      return {
        accent: beat % 4 === 0,
        position: beat * secondsPerBeat,
      };
    },
  );
}

export function scheduleMetronomeClick({
  accent,
  context,
  contextTime,
}: {
  accent: boolean;
  context: AudioContext;
  contextTime: number;
}): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = accent ? 1760 : 1320;
  gain.gain.setValueAtTime(accent ? 0.2 : 0.12, contextTime);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    contextTime + CLICK_DURATION_SECONDS,
  );
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(contextTime);
  oscillator.stop(contextTime + CLICK_DURATION_SECONDS);
}
