# Unified State + Audio Architecture

**Date:** 2026-01-11
**Status:** Idea / Exploration

## Context

After refactoring state management (docs/2026-01-11-state-management-principles.md), we have:
- Zustand store for state
- AudioManager that subscribes to store and syncs Tone.js

These are tightly coupled - effectively one reactive system split across two abstractions. This causes:
- Subscription/sync complexity
- Selective subscription needed to avoid glitches (setNotes, syncAudioTrack reset internal state)
- Two places to understand for any audio-related feature

## Idea: Merge Into Single Store

```typescript
// Unified store - actions directly update state + Tone.js
const useStore = create((set, get) => ({
  // === Serializable state (persisted) ===
  notes: [],
  audioVolume: 0.8,
  audioOffset: 0,
  tempo: 120,
  // ...

  // === Runtime state (not persisted) ===
  _initialized: false,
  _player: null as Tone.Player | null,
  _synth: null as Tone.PolySynth | null,
  _transport: null, // or just use Tone.getTransport() directly

  // === Actions ===
  init: async () => {
    await Tone.start();
    const player = new Tone.Player();
    const synth = new Tone.PolySynth(...);
    // ... setup
    set({ _initialized: true, _player: player, _synth: synth });
  },

  setAudioVolume: (volume) => {
    set({ audioVolume: volume });
    get()._audioChannel?.volume.rampTo(Tone.gainToDb(volume));
  },

  addNote: (note) => {
    set((state) => ({ notes: [...state.notes, note] }));
    get()._midiPart?.add(...);  // Incremental update!
  },

  setAudioOffset: (offset) => {
    set({ audioOffset: offset });
    const player = get()._player;
    if (player) {
      player.unsync();
      player.sync().start(offset);
    }
  },

  // Transport actions
  play: () => Tone.getTransport().start(),
  pause: () => Tone.getTransport().pause(),
  seek: (seconds) => { Tone.getTransport().seconds = seconds; },
}));
```

## Pros

1. **No subscription dance** - actions directly do both state + audio
2. **Incremental updates** - `addNote` can add to Part, not rebuild all
3. **Single mental model** - one place for everything
4. **No selective subscription problem** - each action knows exactly what changed
5. **Cleaner persistence** - just filter out `_` prefixed keys

## Cons

1. **Mixed concerns** - store has side effects (impure actions)
2. **Init timing** - need guards for `_player` being null before init
3. **Testing** - need to mock Tone.js for action tests
4. **Coupled to Tone.js** - store shape influenced by audio implementation

## Alternative: Not Zustand

Could use a simpler pattern:

```typescript
// Custom reactive store
class AppState {
  private listeners = new Set<() => void>();

  // State
  notes: Note[] = [];
  audioVolume = 0.8;

  // Tone.js
  private player: Tone.Player;
  private synth: Tone.PolySynth;

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  setAudioVolume(volume: number) {
    this.audioVolume = volume;
    this.audioChannel.volume.rampTo(Tone.gainToDb(volume));
    this.notify();
  }

  addNote(note: Note) {
    this.notes = [...this.notes, note];
    this.midiPart.add(...);
    this.notify();
  }
}

// React hook
function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(
    appState.subscribe,
    () => selector(appState)
  );
}
```

This is essentially what zustand does, but we own it and can be more explicit about what triggers re-renders.

## Questions to Explore

1. How to handle persistence with mixed serializable/non-serializable state?
2. How to test actions that have Tone.js side effects?
3. Is the "impurity" actually a problem, or just different from Redux mindset?
4. Would this simplify or complicate the codebase overall?

## Next Steps

- [ ] Prototype the unified approach in a branch
- [ ] Compare code complexity (lines, files, concepts)
- [ ] Test audio glitch behavior (does incremental update help?)
- [ ] Evaluate testing story

---

## Notes

*(Add notes as we explore)*
