# Audio ↔ State Sync Refactor

**Date:** 2026-01-10
**Status:** In Progress

## Known Issues (Current Bugs)

These are actual playback bugs, not just code smells:

1. **Play/Stop behavior broken** - (needs characterization: what exactly happens?)
2. **Timeline jumping issues** - seeking/jumping to position doesn't work correctly

These bugs are likely symptoms of the architectural issues below (state sync, event handling, etc.). The refactor should fix them.

**TODO**: Reproduce and document exact failure modes before starting implementation.

---

## Problem Statement

The current architecture has unnecessary complexity from the `AudioManager` wrapper class that sits between the app and Tone.js. This creates:

### 1. Redundant Abstraction Layer

The `AudioManager` class (`src/lib/audio.ts`) wraps Tone.js Transport but adds little value:

```typescript
// AudioManager just forwards to Tone.js:
play(): void {
  this._ensurePlayerConnected();
  Tone.getTransport().start();
}

get isPlaying(): boolean {
  return Tone.getTransport().state === "started";
}

get position(): number {
  return Tone.getTransport().seconds;
}
```

These are thin wrappers that add indirection without abstraction benefits.

### 2. Event Re-emission Anti-pattern

`AudioManager.subscribe()` re-emits Tone.Transport events through its own listener system:

```typescript
// AudioManager creates new handlers that just re-emit Transport events
subscribe(listener: AudioManagerListener): () => void {
  const handleStart = () => emitEvent("start");
  const handleStop = () => emitEvent("stop");
  // ... subscribes to Transport, then emits to listener
  Tone.getTransport().on("start", handleStart);
  // ...
}
```

Why not just subscribe to Tone.Transport directly?

### 3. State Duplication

State is duplicated across three layers:

| State        | Store                    | AudioManager         | Tone.js             |
| ------------ | ------------------------ | -------------------- | ------------------- |
| Playing      | `store.isPlaying`        | `.isPlaying` (get)   | `Transport.state`   |
| Position     | `store.playheadPosition` | `.position` (get)    | `Transport.seconds` |
| Audio offset | `store.audioOffset`      | `._offset`           | N/A                 |
| Metronome    | `store.metronomeEnabled` | `._metronomeEnabled` | N/A                 |
| Volumes      | `store.*Volume`          | Gain nodes           | N/A                 |

The store mirrors AudioManager which mirrors Tone.js. This creates sync complexity.

### 4. Multiple Manual Sync Points

State sync happens in scattered locations:

- **App.tsx (lines 47-52)**: Manual volume sync on project load
- **Transport.tsx (lines 62-76)**: 4 separate `useEffect` hooks for volume sync
- **Transport.tsx (line 50-58)**: Subscription to AudioManager events → updates store
- **PianoRoll.tsx (line 688)**: Manual `audioManager.setOffset()` call

### 5. Unreliable Position Updates

Current code uses `Tone.getTransport().on("ticks", ...)` for playhead position updates:

```typescript
const handleTicks = () => emitEvent("ticks");
Tone.getTransport().on("ticks", handleTicks);
```

**Problems:**

- The "ticks" event frequency depends on Transport's internal tick rate (PPQ-based)
- May not fire frequently enough for smooth 60fps playhead animation
- If Transport.ticks is sparse, playhead appears to jump instead of glide

## Current Architecture (What We Have)

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Components                          │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│  │  Transport  │  │  PianoRoll  │  │        App.tsx         │   │
│  │  - effects  │  │  - seek     │  │  - init volume sync    │   │
│  │  - subscr.  │  │  - offset   │  │                        │   │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬────────────┘   │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          ▼                ▼                     ▼
    ┌─────────────────────────────────────────────────────┐
    │                   audioManager                       │
    │  - subscribe() → re-emits Transport events          │
    │  - play/pause/stop → forwards to Transport          │
    │  - volumes → manages Gain nodes                     │
    │  - scheduleNotes → uses Transport.scheduleOnce      │
    │  - _offset, _metronomeEnabled (duplicate state)     │
    └─────────────────────────┬───────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────┐
    │                Tone.js Transport                     │
    │  - state: "started" | "stopped" | "paused"          │
    │  - seconds: current position                         │
    │  - events: start, stop, pause, ticks, etc.          │
    └─────────────────────────────────────────────────────┘
```

## Target Architecture (What We Want)

Expose Tone.js Transport events and state directly to the app. The AudioManager should only manage what Tone.js doesn't provide: audio file loading, synth setup, gain nodes, and note scheduling.

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Components                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    useTransport() hook                       │ │
│  │  - Subscribes directly to Tone.getTransport() events        │ │
│  │  - Returns { isPlaying, position, play, pause, seek }       │ │
│  │  - Uses RAF for smooth position updates during playback     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                               │                                   │
│  ┌─────────────┐  ┌──────────┴──┐  ┌─────────────────────────┐  │
│  │  Transport  │  │  PianoRoll  │  │        App.tsx          │  │
│  │  (UI only)  │  │  (UI only)  │  │  (init only)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
          │
          ▼ (direct access for audio-specific features)
    ┌─────────────────────────────────────────────────────┐
    │              audioManager (simplified)               │
    │  - loadAudio() → manages Tone.Player                │
    │  - setVolume*() → manages Gain nodes                │
    │  - scheduleNotes() → uses Transport.scheduleOnce    │
    │  - playNote() → preview (immediate)                 │
    │  - getPeaks() → waveform data                       │
    │  NO state mirroring, NO event re-emission           │
    └─────────────────────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────────────────────┐
    │            Tone.js Transport (source of truth)       │
    │  - Direct subscription from useTransport() hook     │
    │  - state, seconds, events                           │
    └─────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Create `useTransport` Hook

Create a React hook that directly interfaces with Tone.js Transport:

```typescript
// src/hooks/use-transport.ts
export function useTransport() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const transport = Tone.getTransport();

    // Subscribe to Transport state changes
    const handleStart = () => setIsPlaying(true);
    const handleStop = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);

    transport.on("start", handleStart);
    transport.on("stop", handleStop);
    transport.on("pause", handlePause);

    // RAF loop for smooth position updates (only when playing)
    let rafId: number;
    const updatePosition = () => {
      if (transport.state === "started") {
        setPosition(transport.seconds);
        rafId = requestAnimationFrame(updatePosition);
      }
    };

    // Start RAF loop on play
    const startRAF = () => {
      rafId = requestAnimationFrame(updatePosition);
    };
    transport.on("start", startRAF);

    return () => {
      transport.off("start", handleStart);
      transport.off("stop", handleStop);
      transport.off("pause", handlePause);
      transport.off("start", startRAF);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const play = useCallback(() => Tone.getTransport().start(), []);
  const pause = useCallback(() => Tone.getTransport().pause(), []);
  const stop = useCallback(() => {
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
  }, []);
  const seek = useCallback((seconds: number) => {
    Tone.getTransport().seconds = seconds;
    setPosition(seconds);
  }, []);

  return { isPlaying, position, play, pause, stop, seek };
}
```

### Phase 2: Simplify AudioManager

Remove state mirroring and event re-emission from AudioManager:

**Remove:**

- `subscribe()` method (no longer needed)
- `isPlaying` getter (use hook instead)
- `position` getter (use hook instead)
- `play()`, `pause()`, `stop()` methods (use hook instead)

**Keep:**

- Audio file loading (`loadAudio`, `loadFromUrl`)
- Gain node management (`setAudioVolume`, `setMidiVolume`, etc.)
- Note scheduling (`scheduleNotes`, `clearScheduledNotes`, `updateNotesWhilePlaying`)
- Note preview (`playNote`)
- Waveform data (`getPeaks`)
- Player sync (`setOffset`, `_syncPlayer`)
- Metronome control (stays in AudioManager since it manages the Sequence)

### Phase 3: Update Components

**Transport.tsx:**

- Replace `audioManager.subscribe()` with `useTransport()` hook
- Remove manual `setIsPlaying` / `setPlayheadPosition` calls
- Keep volume/metronome effects (these still need AudioManager)

**PianoRoll.tsx:**

- Use `useTransport()` for position/seeking
- Keep `audioManager.setOffset()` and `audioManager.playNote()` calls

**App.tsx:**

- Keep initial volume sync (needed before components mount)
- Remove any `audioManager` calls that relate to transport state

### Phase 4: Store Cleanup (Optional)

Consider whether `isPlaying` and `playheadPosition` should remain in the store:

**Option A: Keep in store** (simpler, current approach)

- Hook updates store, components read from store
- Allows components that don't use the hook to still access state

**Option B: Remove from store** (cleaner, but more changes)

- Transport state lives only in the hook
- Components must use `useTransport()` to access state
- Persistence doesn't need these (they're transient)

Recommend **Option A** for now - the hook can update the store as a side effect.

### Phase 5: Consider Volume Sync

Current approach uses multiple effects to sync volume from store to AudioManager:

```typescript
useEffect(() => {
  audioManager.setAudioVolume(audioVolume);
}, [audioVolume]);
useEffect(() => {
  audioManager.setMidiVolume(midiVolume);
}, [midiVolume]);
// etc.
```

This is fine, but could be consolidated into:

1. A single effect with all dependencies
2. Or a `useMixerSync()` hook

Low priority - current approach works.

## Files to Modify

| File                            | Changes                                              |
| ------------------------------- | ---------------------------------------------------- |
| `src/hooks/use-transport.ts`    | **NEW** - Transport hook                             |
| `src/lib/audio.ts`              | Remove subscribe, state getters, transport methods   |
| `src/components/transport.tsx`  | Use hook instead of audioManager.subscribe           |
| `src/components/piano-roll.tsx` | Use hook for position/seeking                        |
| `src/app.tsx`                   | Minor cleanup                                        |
| `src/stores/project-store.ts`   | No changes needed (keep isPlaying, playheadPosition) |

## Success Criteria

- [ ] `useTransport()` hook directly subscribes to `Tone.getTransport()` events
- [ ] Smooth playhead animation via RAF (not dependent on "ticks" event)
- [ ] `AudioManager.subscribe()` removed
- [ ] No state duplication for `isPlaying` between AudioManager and Tone.js
- [ ] All 37 E2E tests pass
- [ ] TypeScript compiles without errors
- [ ] Lint passes

## Open Questions

1. **RAF loop location**: Should the RAF loop live in the hook or remain centralized?
   - Hook: cleaner separation, each consumer controls their own updates
   - Centralized: single RAF loop, multiple consumers share updates

2. **Store sync**: Should the hook update the store, or should components that need store access use a separate subscription?
   - Recommend: Hook updates store as side effect for backwards compatibility

3. **Metronome**: Should metronome control move to a separate hook/manager?
   - Probably not worth the complexity - keep in AudioManager

## Code Smells to Address (Follow-up)

### 4. Deferred Initialization Patterns

Now that startup screen guarantees `audioManager.init()` before any audio operations, these patterns are unnecessary:

**`_ensurePlayerConnected()`** (line 167-173):

```typescript
private _ensurePlayerConnected(): void {
  if (this.player && this.audioGain && !this._playerConnected) {
    this.player.connect(this.audioGain);
    this._syncPlayer();
    this._playerConnected = true;
  }
}
```

This exists because audio could be loaded before init. With startup screen, we can connect immediately in `loadFromUrl()`.

**`_startMetronomeAligned()` deferred call** (line 126-129):

```typescript
// Apply deferred metronome state (may have been set before init)
if (this._metronomeEnabled) {
  this._startMetronomeAligned();
}
```

Same issue - metronome state set before init. No longer needed.

**`_playerConnected` flag**: Only needed for deferred connection tracking. Can be removed.

### 5. Unnecessary Null Checks

Since `init()` is guaranteed before use, these defensive checks add noise:

- `if (this.synth)` in `playNote()`, `scheduleNotes()`
- `if (this.audioGain)` in `setAudioVolume()`, `_ensurePlayerConnected()`
- `if (this.midiGain)` in `setMidiVolume()`
- `if (this.metronomeGain)` in `setMetronomeVolume()`
- `if (this.metronomeSeq)` in `setMetronomeEnabled()`
- `this.metronome?.triggerAttackRelease()` in sequence callback

**Recommendation**: Use non-null assertion or refactor to guarantee initialization. Could use a pattern like:

```typescript
class AudioManager {
  private audioGain!: Tone.Gain; // Definite assignment assertion
  // ...
}
```

### 6. Player Sync Complexity

**`_syncPlayer()` and `setOffset()` dance**:

```typescript
setOffset(offset: number): void {
  // ...
  const wasPlaying = this.isPlaying;
  if (wasPlaying) {
    Tone.getTransport().pause();
  }
  this._syncPlayer();  // unsync, then sync with new offset
  if (wasPlaying) {
    Tone.getTransport().seconds = currentPosition;
    Tone.getTransport().start();
  }
}
```

This pause/unsync/sync/resume pattern is fragile. Consider:

- Does Tone.js have a better API for changing player offset without stopping?
- Could we use `player.seek()` instead of unsync/sync?
- Is there a cleaner way to handle audio alignment?

### 7. Note Scheduling During Playback

**`updateNotesWhilePlaying()` clears ALL notes**:

```typescript
updateNotesWhilePlaying(notes: Note[], tempo: number): void {
  if (this.isPlaying) {
    this.scheduleNotes(notes, this.position, tempo);  // calls clearScheduledNotes() first
  }
}
```

This could cause audible glitches if a note is mid-play when cleared. Consider:

- Differential scheduling (only add/remove changed notes)
- Or accept the limitation and document it

### 8. Metronome Beat Alignment

**`_startMetronomeAligned()`** calculates next measure boundary:

```typescript
const nextMeasure = Math.ceil(position / secondsPerMeasure) * secondsPerMeasure;
this.metronomeSeq.start(nextMeasure);
```

This ensures beat 1 accent aligns with measures, but:

- Assumes 4/4 time signature (hardcoded)
- Could be simpler if metronome just follows Transport from position 0
- The alignment logic adds complexity for questionable UX benefit

**Thoughts**: These are lower priority than the main refactor. Address after the core `useTransport()` hook is working. The null checks and deferred init patterns are quick wins once we verify startup screen always runs first.

## Status

### Done

- [x] Analysis of current architecture
- [x] Identified problems with current approach
- [x] Designed target architecture
- [x] Created implementation plan

### Remaining

- [ ] Implement `useTransport()` hook
- [ ] Refactor AudioManager
- [ ] Update Transport component
- [ ] Update PianoRoll component
- [ ] Test and verify

## Feedback Log

**2026-01-11**: Store position handling

- Remove `playheadPosition` and `isPlaying` from store for now (they're transient, not persisted)
- Follow-up: Add `lastPlayheadPosition` as a cache for session restore
  - Only update on start/stop/pause events (not during RAF playback)
  - Used to restore position when reloading project
  - Hook owns "live" position, store owns "cached" position for persistence
