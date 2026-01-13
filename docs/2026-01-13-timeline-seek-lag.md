# Timeline Seek Lag Fix

## Problem

When paused, clicking the timeline to jump to a position has noticeable lag (~300ms) before the playhead updates.

## Actual Root Cause

**The initial analysis below was wrong.** The real issue was re-render performance:

- `Transport` component used `useTransport()` which returns `{ isPlaying, position }`
- Even destructuring only `isPlaying`, the component re-renders when `position` changes (new object reference)
- Transport contains instrument `Select` with **128 GM_PROGRAMS items**
- Every seek → Transport re-renders → 128 SelectItems re-render → ~300ms lag

**Fix**: Isolate `useTransport()` into small leaf components (`PlayPauseButton`, `TimeDisplay`). Transport no longer subscribes, so the expensive Select doesn't re-render on position changes.

**Future considerations**:

- React Compiler could auto-memoize and prevent this class of issues
- Selector pattern `useTransport(s => s.isPlaying)` would also help

---

## Initial Analysis (incorrect)

_The analysis below was our initial hypothesis, but testing showed the lag was from re-renders, not missing events._

### Original Hypothesis

The `useTransport` hook (`src/hooks/use-transport.ts`) relies on Tone.js transport events to detect position changes:

- Events listened: `start`, `stop`, `pause`, `loop`, `loopEnd`, `loopStart`, `ticks`

When `audioManager.seek()` sets `Tone.getTransport().seconds` directly, **no event is fired**.

**During playback**: RAF loop polls position at 60fps, so updates happen quickly.

**When paused**: RAF loop is cancelled (lines 37-40), so position only updates when `handler()` is called by a transport event.

### What triggers the eventual update?

The state can only update via:

1. **Transport events** - `handler()` is called, which runs `setTransportState(deriveState())`
2. **RAF loop** - only active during playback

Possible triggers for the "lagged" update:

- **"ticks" event**: May fire asynchronously when `Transport.seconds` is set (needs verification - Tone.js internal behavior)
- **User presses play**: Fires "start" event, handler runs, position is re-derived
- **Other UI interaction**: If something else triggers a transport event

**Note**: React re-renders from unrelated state changes do NOT help here - `useTransport` returns memoized state that only updates inside `handler()` or the RAF loop. The `deriveState()` function is not called on every render.

**To verify**: Add `console.log` in `handler()` to see which event fires (if any) when clicking timeline while paused.

### Data Flow (broken path highlighted)

```
Timeline click
  → onSeek callback (piano-roll.tsx:1039-1042)
  → audioManager.seek(seconds) (audio.ts:287-289)
  → Tone.getTransport().seconds = X
  → [NO EVENT FIRED] ← problem
  → useTransport doesn't update
  → playhead position stale
```

## Relevant Files

| File                            | Lines     | What                                  |
| ------------------------------- | --------- | ------------------------------------- |
| `src/hooks/use-transport.ts`    | 14-67     | Transport state hook, event listeners |
| `src/lib/audio.ts`              | 287-289   | `seek()` method                       |
| `src/components/piano-roll.tsx` | 1039-1042 | Timeline `onSeek` callback            |
| `src/components/piano-roll.tsx` | 1466-1472 | Timeline click handler                |

## Architectural Context

### Existing Principle (from `docs/2026-01-11-state-management-principles.md`)

```
UI Event → Store Action → (subscription syncs AudioManager)
```

**Exception for transport control**: `play()`, `pause()`, `seek()` are allowed to be called directly from components because they're transient (not persisted).

### Pending `lastPlayheadPosition` Plan (from PRD)

```
- [ ] feat: persist lastPlayheadPosition
  - Only update on start/stop/pause events (not during RAF playback)
  - Used to restore position when reloading project
  - Hook owns "live" position, store owns "cached" position for persistence
```

The original intent: a **persisted cache** for session restore, not real-time UI updates.

---

## Solution Options

### Option A: Route seek through store (follow the principle)

Make `seek` flow through store, which `useTransport` can subscribe to:

```typescript
// project-store.ts - add action
seekPosition: (seconds: number) => {
  set({ lastPlayheadPosition: seconds });
  Tone.getTransport().seconds = Math.max(0, seconds);
},
```

```typescript
// use-transport.ts - subscribe to store for paused updates
useEffect(() => {
  // When paused, also listen to store changes
  const unsub = useProjectStore.subscribe(
    (state) => state.lastPlayheadPosition,
    (position) => {
      if (!Tone.getTransport().state.startsWith("started")) {
        setTransportState(deriveState());
      }
    },
  );
  return unsub;
}, []);
```

**Pros**: Follows the principle, enables session restore feature later
**Cons**: Blurs the original intent of `lastPlayheadPosition` (cache vs real-time), adds complexity

### Option B: Custom DOM Event (quick fix)

```typescript
// audio.ts
seek(seconds: number): void {
  Tone.getTransport().seconds = Math.max(0, seconds);
  window.dispatchEvent(new Event("transport-seek"));
}
```

**Pros**: Minimal changes, doesn't mix concerns
**Cons**: Global event, implicit coupling, doesn't follow the principle

### Option C: Expose `notifySeek()` from useTransport

Have `useTransport` export a function that components call after seeking.

```typescript
// use-transport.ts
export function useTransport() {
  // ...
  const refresh = useCallback(() => setTransportState(deriveState()), []);
  return { ...transportState, refresh };
}
```

```typescript
// piano-roll.tsx
const { position, refresh } = useTransport();
// ...
onSeek={(beat) => {
  audioManager.seek(beatsToSeconds(beat, tempo));
  refresh();  // Explicit
}}
```

**Pros**: Explicit, no global events, no store changes
**Cons**: Requires threading `refresh` through components, caller must remember to call it

---

## Trade-offs

| Option         | Follows Principle | Enables Persistence | Complexity | Implicit Coupling |
| -------------- | ----------------- | ------------------- | ---------- | ----------------- |
| A (store)      | ✅                | ✅                  | Medium     | No                |
| B (DOM event)  | ❌                | ❌                  | Low        | Yes               |
| C (refresh fn) | ❌                | ❌                  | Low        | No                |

---

## Clarification: What's the actual paradigm?

The existing paradigm for transport position is:

```
Tone.js Transport (source of truth for position)
       │
       └── useTransport subscribes via RAF during playback
           (RAF = regular "poke" to re-read source of truth at 60fps)
```

This is **not** the store-based pattern. Position intentionally lives in Tone.js, not the store.

The bug is: when paused, there's no RAF loop, and `seek()` doesn't notify useTransport to re-read.

**Option B (seek event) completes the paradigm** - it's just another "poke" mechanism, like RAF:

```
Tone.js Transport (source of truth)
       │
       ├── RAF polls during playback (periodic poke)
       │
       └── seek event when paused (one-time poke)
```

**Option A (store) would break the paradigm** - it makes the store a middleman for position, which contradicts Tone.js being the source of truth.

## Recommendation

**Option B** - Dispatch event on seek. This is the natural completion of the existing paradigm, not a hack.

## Implementation Steps

1. [ ] Add `window.dispatchEvent(new Event("transport-seek"))` in `audioManager.seek()`
2. [ ] Add event listener in `useTransport` hook to call `setTransportState(deriveState())`
3. [ ] Test: click timeline while paused → immediate playhead update
4. [ ] Test: click timeline while playing → no regression

## Feedback Log

**2026-01-13**: Clarified paradigm. Transport position uses Tone.js as source of truth (not store). RAF is already a "poke" mechanism during playback. Adding a seek event is completing this paradigm, not breaking store principles. `lastPlayheadPosition` (for persistence) is a separate concern.

**2026-01-13**: Found the real performance issue. After implementing Option B, there was still ~300ms lag. Chrome Performance + React 19 component tree revealed:

- `Transport` component used `useTransport()` which returns `{ isPlaying, position }`
- Even destructuring only `isPlaying`, the component re-renders when `position` changes (new object reference)
- Transport contains instrument `Select` with **128 GM_PROGRAMS items** (16 groups × 8 items)
- Every position change → Transport re-renders → 128 SelectItems re-render

**Why this wasn't visible during playback**: RAF updates at 60fps during playback work fine because React batches rapid updates. The seek event while paused triggered a single expensive re-render that wasn't batched.

**Fix**: Isolate `useTransport()` subscriptions into small leaf components:

- `PlayPauseButton` - subscribes to `isPlaying`, handles Space key
- `TimeDisplay` - subscribes to `position`
- `Transport` - no longer uses `useTransport()`, expensive Select doesn't re-render

**Future considerations**:

- React Compiler could auto-memoize and prevent this class of issues
- Selector pattern for `useTransport(s => s.isPlaying)` would also help
- Split hooks (`useTransportIsPlaying()`, `useTransportPosition()`) as alternative

## Future: Tone.getDraw() API

Tone.js provides `Tone.getDraw()` - a RAF-backed audio→UI sync mechanism. Currently `useTransport` rolls its own RAF loop.

### How Draw works

```typescript
Tone.getDraw().schedule(callback, time); // Schedule at audio time
Tone.getDraw().cancel(after); // Cancel events
```

- `anticipation` (8ms): Look-ahead window before scheduled time
- `expiration` (250ms): Max allowed delay for late callbacks
- Uses `AudioContext.currentTime` (not `performance.now()`)

### Draw vs RAF polling

| Aspect         | Current (RAF polling)     | Draw                               |
| -------------- | ------------------------- | ---------------------------------- |
| Model          | Poll position every frame | Schedule callback at specific time |
| Time reference | `Transport.seconds`       | `AudioContext.currentTime`         |
| Use case       | Continuous (playhead)     | Discrete events (note triggers)    |

### Would Draw help useTransport?

Draw is **event-driven** (schedule at time X), not **continuous polling** (what's the position now?).

For playhead, Draw would look like:

```typescript
transport.scheduleRepeat((time) => {
  Tone.getDraw().schedule(() => updatePlayhead(), time);
}, "16n");
```

**Trade-off**: More principled for discrete events, but RAF polling is simpler for smooth continuous playhead movement.

**Verdict**: Current RAF approach is probably fine for playhead. Draw would be useful if we add beat/note visual feedback synced to audio.

## Status

- **Done**:
  - Root cause analysis, paradigm clarification
  - Implementation (Option B - seek event)
  - Performance fix (isolate Transport re-renders)
- **Remaining**: None
- **Blockers**: None
