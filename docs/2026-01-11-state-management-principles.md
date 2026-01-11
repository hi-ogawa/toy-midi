# State Management Principles & Consolidation

**Date:** 2026-01-11
**Status:** Planning

## Overview

After multiple refactoring rounds, the architecture is mostly in place but the **pattern is not consistently applied**. This document clarifies the intended pattern and identifies where it breaks down.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            React Components                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Transport   │  │  PianoRoll   │  │     App      │  │ useTransport()   │ │
│  │  (controls)  │  │  (editor)    │  │  (lifecycle) │  │ (hook)           │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────▲─────────┘ │
└─────────┼─────────────────┼─────────────────┼───────────────────┼───────────┘
          │ ▲               │                 │                   │
          │ │ useProject-   │                 │                   │
          │ │ Store()       │                 │                   │
          ▼ │               ▼                 ▼                   │
    ┌───────┴─────────────────────────────────┐                   │
    │          Zustand Store                  │                   │
    │  (project-store.ts)                     │                   │
    │                                         │                   │
    │  Persisted: notes, tempo, volumes,      │                   │
    │             gridSnap, viewport, etc.    │                   │
    └──────────────────┬──────────────────────┘                   │
                       │                                          │
                       │ subscribe                                │ events
                       ▼                                          │
    ┌─────────────────────────────────────────────────────────────┴──────────┐
    │                         AudioManager                                   │
    │  (audio.ts singleton)                                                  │
    │                                                                        │
    │  ┌─────────────────────────────────────────────────────────────────┐   │
    │  │  Tone.js Transport  (source of truth for playback state)        │   │
    │  │  - state: started/stopped/paused                                │   │
    │  │  - seconds: current position                                    │   │
    │  │  - bpm                                                          │   │
    │  └─────────────────────────────────────────────────────────────────┘   │
    │                                                                        │
    │  + Synth/Player/Metronome    + Volume control (Gain nodes)             │
    │  + Note scheduling (Part)    + Audio file loading                      │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## The Intended Pattern

### Rule 1: Components talk to Store, not AudioManager

```
UI Event → Store Action → (subscription syncs AudioManager)
```

**Components should:**

- Read state via `useProjectStore()` hook
- Write state via store actions
- **NEVER** call `audioManager.setXxx()` for state that's in the store

**Components CAN call AudioManager for:**

- `audioManager.play()` / `pause()` / `seek()` - transport control (not in store)
- `audioManager.playNote()` - preview sound (ephemeral, not state)

### Rule 2: AudioManager subscribes to ALL relevant store state

```typescript
// AudioManager.init()
useProjectStore.subscribe((state) => {
  // ALL state that AudioManager cares about
  this.setAudioVolume(state.audioVolume);
  this.setMidiVolume(state.midiVolume);
  this.setMetronomeVolume(state.metronomeVolume);
  this.setMetronomeEnabled(state.metronomeEnabled);
  this.setNotes(state.notes);
  this.syncAudioTrack(state.audioOffset); // <-- MISSING TODAY
  Tone.getTransport().bpm.value = state.tempo;
});
```

**AudioManager should:**

- React to store changes via `.subscribe()`
- **NEVER** read from store via `.getState()` (except edge cases)

### Rule 3: Initialization flows through the same path

```
loadProject() → store update → subscription fires → AudioManager syncs
```

No special "init sync" code needed. The subscription handles it.

---

## Where the Pattern Breaks Down

### Issue 1: Incomplete Subscription

**audio.ts:90-99** subscribes to:

- ✅ audioVolume, midiVolume, metronomeVolume, metronomeEnabled
- ✅ notes, tempo
- ❌ **audioOffset** - MISSING

Because `audioOffset` is missing, components must call `syncAudioTrack()` directly.

### Issue 2: Imperative Calls from Components

**piano-roll.tsx:680-684**

```typescript
onOffsetChange={(newOffset) => {
  // TODO: act on store change not UI event
  audioManager.syncAudioTrack(newOffset);  // ❌ Direct call
  setAudioOffset(newOffset);
}}
```

Should be:

```typescript
onOffsetChange={(newOffset) => {
  setAudioOffset(newOffset);  // ✅ Just update store
  // AudioManager subscription handles the rest
}}
```

### Issue 3: Init Sync in Wrong Place

**app.tsx:47-53**

```typescript
// Sync mixer settings with audioManager
// TODO: consolidate with AudioManager.init
const state = useProjectStore.getState();
audioManager.setAudioVolume(state.audioVolume);
audioManager.setMidiVolume(state.midiVolume);
audioManager.setMetronomeEnabled(state.metronomeEnabled);
audioManager.setMetronomeVolume(state.metronomeVolume);
```

**Why this exists:** Zustand's `subscribe()` only fires on _changes_, not on initial subscribe. So for the "new project" case (no `loadProject()` call), the subscription never fires and initial state isn't applied.

**The problem:** This sync logic belongs in AudioManager, not app.tsx. The fix is to have AudioManager read initial state during `init()`, then subscribe for future changes.

### Issue 4: getState() in AudioManager

**audio.ts:129-130**

```typescript
syncAudioTrack(
  offset: number = useProjectStore.getState().audioOffset,  // ❌ Reads from store
): void {
```

This breaks the pattern. If `audioOffset` were in the subscription, this method would receive offset as a parameter, not read it.

---

## The Fix

### Step 1: Complete the subscription

```typescript
// audio.ts - add audioOffset to subscription
useProjectStore.subscribe((state) => {
  this.setAudioVolume(state.audioVolume);
  this.setMidiVolume(state.midiVolume);
  this.setMetronomeVolume(state.metronomeVolume);
  this.setMetronomeEnabled(state.metronomeEnabled);
  this.setNotes(state.notes);
  this.syncAudioTrack(state.audioOffset); // ADD THIS
  Tone.getTransport().bpm.value = state.tempo;
});
```

### Step 2: Remove imperative calls from components

```typescript
// piano-roll.tsx
onOffsetChange={(newOffset) => {
  setAudioOffset(newOffset);  // Just this, nothing else
}}
```

### Step 3: Move init sync to AudioManager

```typescript
// audio.ts - AudioManager.init()
async init(): Promise<void> {
  // ... setup synths ...

  // Apply initial state (subscription doesn't fire on subscribe)
  const initial = useProjectStore.getState();
  this.applyState(initial);

  // Subscribe for future changes
  useProjectStore.subscribe((state) => {
    this.applyState(state);
  });
}

private applyState(state: ProjectState): void {
  this.setAudioVolume(state.audioVolume);
  this.setMidiVolume(state.midiVolume);
  this.setMetronomeVolume(state.metronomeVolume);
  this.setMetronomeEnabled(state.metronomeEnabled);
  this.setNotes(state.notes);
  this.syncAudioTrack(state.audioOffset);
  Tone.getTransport().bpm.value = state.tempo;
}
```

```typescript
// app.tsx - delete lines 47-53
// AudioManager.init() handles it now
```

### Step 4: Remove getState() from AudioManager

```typescript
// audio.ts - syncAudioTrack always receives offset as parameter
syncAudioTrack(offset: number): void {
  this.player.unsync();
  this.player.sync().start(offset);
}
```

---

## Access Pattern Summary

| Context              | Read Store          | Write Store      | Call AudioManager      |
| -------------------- | ------------------- | ---------------- | ---------------------- |
| **React Components** | `useProjectStore()` | store actions    | transport control only |
| **AudioManager**     | `.subscribe()` only | never            | n/a                    |
| **App init**         | `.getState()` OK    | `.setState()` OK | `.init()` only         |
| **Persistence**      | `.getState()`       | `.setState()`    | never                  |

---

## Secondary Concerns (Lower Priority)

These are real but not blocking:

### Selective Subscription (Performance)

Currently subscription fires on every store change. Could use `subscribeWithSelector` to be more efficient. But the pattern issue is more important.

### useTransport Selector (Performance)

Components re-render at 60fps during playback even if they only need `isPlaying`. Could split into separate hooks. But the pattern issue is more important.

### Naming Consistency

`player` vs `audioPlayer`, etc. Cosmetic.

---

## Validation Checklist

After fix:

- [x] `audioManager.syncAudioTrack()` only called from app.tsx (async buffer load edge case)
- [x] `audioManager.setXxx()` never called from components
- [x] AudioManager subscription includes `audioOffset`
- [x] app.tsx has no redundant mixer sync code
- [x] All tests pass (28 E2E, 5 unit)

---

## Status

### Done

- [x] Identified pattern violations
- [x] Documented intended pattern
- [x] Implement the fix (Steps 1-4)
- [x] Verify tests pass

### Remaining

- [ ] Clean up remaining TODOs in code (lower priority)

---

## Feedback Log

**2026-01-11:** User feedback - focus on pattern consistency, not performance. The issue is `useProjectStore` scattered everywhere with inconsistent usage, not about selective subscriptions.

**2026-01-11:** Implementation complete. Pattern now applied consistently:
- AudioManager uses applyState() for initial + subscription sync
- Components only call store actions, not audioManager.setXxx()
- audioOffset included in subscription
