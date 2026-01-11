# State Management Principles & Consolidation

**Date:** 2026-01-11
**Status:** Planning

## Overview

After multiple refactoring rounds, the state management architecture has improved significantly. This document consolidates our principles and addresses the remaining TODOs scattered throughout the codebase.

---

## Current Architecture (After Refactors)

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

## Key Principles

### 1. Single Source of Truth per Domain

| Domain | Source of Truth | Subscribers |
|--------|-----------------|-------------|
| Playback state (playing, position) | `Tone.Transport` | `useTransport` hook |
| Tempo/BPM | **Store** *(TODO: migrate to Transport)* | AudioManager, UI |
| Project data (notes, settings) | Zustand Store | AudioManager, UI, localStorage |
| Audio nodes (volumes, synths) | AudioManager | N/A (internal) |

### 2. Unidirectional Data Flow

```
User Action → Store Update → AudioManager (via subscription) → Tone.js
                           ↘ React re-render

Tone.Transport Event → useTransport hook → React state → UI re-render
```

- Store never reads from AudioManager or Tone.js
- AudioManager reacts to store changes via `useProjectStore.subscribe()`
- Components read transport state via `useTransport()` hook

### 3. Reactive Subscriptions Over Imperative Sync

**Before (scattered sync points):**
```typescript
// In component effects - imperative, easy to miss
useEffect(() => { audioManager.setAudioVolume(audioVolume); }, [audioVolume]);
useEffect(() => { audioManager.setMidiVolume(midiVolume); }, [midiVolume]);
// ... repeated for each setting
```

**After (centralized subscription):**
```typescript
// In AudioManager.init() - reactive, single source
useProjectStore.subscribe((project) => {
  this.setAudioVolume(project.audioVolume);
  this.setMidiVolume(project.midiVolume);
  // ... all syncs in one place
});
```

### 4. Transient vs Persisted State Separation

| Type | Examples | Storage |
|------|----------|---------|
| **Persisted** | notes, tempo, volumes, viewport | Zustand → localStorage |
| **Transient** | isPlaying, position, drag mode | Hook state / Component state |
| **Derived** | waveform peaks, audio duration | Computed on load |

---

## Remaining TODOs (Consolidated)

### Priority 1: High Impact

#### 1.1 Transport BPM as Source of Truth
**Location:** `src/lib/audio.ts:98`, `src/hooks/use-transport.ts:84`

**Current:** Store owns `tempo`, synced to Transport via subscription.

**Problem:** Two sources of truth. Store tempo vs Transport.bpm could drift.

**Solution:**
```typescript
// Option A: Keep store as authority (simpler, current approach)
// Store → Transport sync (already working)

// Option B: Transport as authority (cleaner, but breaks persistence model)
// Would require: Transport → Store sync on changes

// Recommendation: Option A for now
// But expose Transport.bpm in useTransport for read-only display
```

**Action:** Low priority - current approach works. Document the pattern.

#### 1.2 Selective Store Subscription
**Location:** `src/lib/audio.ts:91`

**Current:** AudioManager subscribes to entire store, re-applies all settings on any change.

**Problem:** Performance - every note edit triggers volume/metronome updates.

**Solution:**
```typescript
import { subscribeWithSelector } from 'zustand/middleware';

// In audio.ts - separate subscriptions
useProjectStore.subscribe(
  (state) => state.audioVolume,
  (volume) => this.setAudioVolume(volume)
);
useProjectStore.subscribe(
  (state) => state.notes,
  (notes) => this.setNotes(notes)
);
// etc.
```

**Action:** Medium priority. Add `subscribeWithSelector` middleware.

#### 1.3 useTransport Selector Pattern
**Location:** `src/hooks/use-transport.ts:15-20`

**Current:** Hook returns `{ isPlaying, position }`, position updates at 60fps.

**Problem:** Components that only need `isPlaying` re-render every frame during playback.

**Solution:**
```typescript
// Option A: Split hooks
export function useIsPlaying(): boolean { ... }
export function usePlayheadPosition(): number { ... }

// Option B: Selector pattern
export function useTransport<T>(selector: (state: TransportState) => T): T { ... }

// Option C: useSyncExternalStore with selector
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector';
```

**Action:** Medium priority. Implement Option A (simplest) or Option B.

### Priority 2: Code Quality

#### 2.1 AudioManager Naming Consistency
**Location:** `src/lib/audio.ts:16-25`

**Current:** Mixed naming (`midiSynth`, `player`, `metronome`).

**Target naming (align with Tone.js):**
```typescript
private midiSynth: Tone.PolySynth;      // OK
private midiChannel: Tone.Channel;       // OK
private midiPart: Tone.Part;             // OK

private audioPlayer: Tone.Player;        // Rename from `player`
private audioChannel: Tone.Channel;      // OK

private metronome: Tone.Synth;           // OK
private metronomeSeq: Tone.Sequence;     // OK
private metronomeChannel: Tone.Channel;  // OK
```

**Action:** Low priority. Rename `player` → `audioPlayer`.

#### 2.2 Incremental Note Scheduling
**Location:** `src/lib/audio.ts:136`

**Current:** `setNotes()` clears all and re-adds all notes.

**Problem:** Could cause glitches during playback.

**Solution:**
```typescript
setNotes(notes: Note[]): void {
  // Diff-based approach
  const currentIds = new Set(this.midiPart./* get event ids */);
  const newIds = new Set(notes.map(n => n.id));

  // Remove deleted
  for (const id of currentIds) {
    if (!newIds.has(id)) this.midiPart.remove(/* by id */);
  }

  // Add new
  for (const note of notes) {
    if (!currentIds.has(note.id)) this.midiPart.add(/* ... */);
  }
}
```

**Reality check:** Tone.Part doesn't expose easy diff operations. Current approach may be acceptable.

**Action:** Low priority. Document limitation. Consider for future if glitches occur.

#### 2.3 Audio Seek Pattern
**Location:** `src/lib/audio.ts:112-125`

**Current:** Pause → seek → sync → resume pattern.

**Questions:**
- Does `transport.seconds = x` work during playback? (Yes, per Tone.js docs)
- Is pause/resume needed? (Maybe not for Transport, but needed for Player sync)

**Action:** Test if simpler pattern works. Low priority.

### Priority 3: Documentation / Follow-up

#### 3.1 Persist lastPlayheadPosition
**Location:** `docs/prd.md:89`

**Purpose:** Restore playhead position when reloading project.

**Implementation:**
```typescript
// In project-store.ts SavedProject
lastPlayheadPosition?: number;

// In useTransport - update on pause/stop
useEffect(() => {
  if (!isPlaying) {
    useProjectStore.getState().setLastPlayheadPosition(position);
  }
}, [isPlaying]);
```

**Action:** Feature work, not refactoring. Track in PRD.

#### 3.2 Align Naming with Tone.js
**Location:** `src/hooks/use-transport.ts:80`

**Current:** `isPlaying`, `position`

**Tone.js names:** `state === "started"`, `seconds`

**Decision:** Keep current names - they're clearer for React/UI context.

**Action:** Document decision. No change needed.

---

## File-by-File TODO Map

### `src/hooks/use-transport.ts`
- [ ] Line 15-20: Implement selector pattern or split hooks (P2)
- [x] Line 41: Microtask workaround - works, document why
- [x] Line 80: Naming decision - keep current, document
- [ ] Line 84: Expose Transport.bpm read-only (P3)

### `src/lib/audio.ts`
- [ ] Line 16: Rename `player` → `audioPlayer` (P3)
- [x] Line 17: Non-null assertions already in place
- [ ] Line 19: Soundfont - feature work, not refactor
- [ ] Line 33: Remove commented code
- [x] Line 85-89: State flow documented in this doc
- [ ] Line 91: Add selective subscription middleware (P1)
- [x] Line 112-113: Seek pattern - tested, works
- [x] Line 127-128: Buffer ready - handled by Tone.js
- [ ] Line 136: Incremental notes - document limitation (P3)

### `src/app.tsx`
- [x] Line 48: Consolidated with AudioManager.init - already done
- [x] Line 57: E2E escape hatch - not needed, debounce is fine

### `src/components/transport.tsx`
- [x] Line 51: Refactor with initial restore - already done via subscription pattern

### `src/components/piano-roll.tsx`
- [ ] Line 681: `audioManager.syncAudioTrack()` on offset change - should be via subscription (P2)

---

## Action Plan

### Phase 1: Performance (P1)
1. Add `subscribeWithSelector` middleware to zustand store
2. Split AudioManager subscription into selective subscriptions
3. (Optional) Split useTransport into useIsPlaying + usePlayheadPosition

### Phase 2: Code Quality (P2)
1. Move `syncAudioTrack` call from piano-roll to AudioManager subscription
2. Clean up commented code in audio.ts
3. Consider renaming `player` → `audioPlayer`

### Phase 3: Documentation (P3)
1. Update architecture.md with finalized flow diagrams
2. Document known limitations (note scheduling, seek pattern)
3. Remove outdated TODOs from code

---

## Validation Checklist

Before marking complete:
- [ ] `pnpm tsc && pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm test-e2e` passes
- [ ] Playback works (start, pause, seek while playing, seek while paused)
- [ ] Volume changes apply immediately
- [ ] Metronome toggle is responsive
- [ ] Notes play during playback
- [ ] Audio track syncs with transport

---

## Status

### Done
- [x] Analyzed current architecture
- [x] Consolidated all TODOs from codebase
- [x] Documented principles
- [x] Created prioritized action plan

### In Progress
- [ ] Waiting for user feedback on priorities

### Remaining
- [ ] Phase 1 implementation
- [ ] Phase 2 implementation
- [ ] Phase 3 documentation updates

---

## Feedback Log

*(Append user feedback here)*
