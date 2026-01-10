# Audio ↔ State Sync Refactor

**Date:** 2026-01-10  
**Status:** Complete ✅

## Problem Statement

The previous architecture had four main issues:

1. **Two sources of truth**: `store.isPlaying` vs `audioManager.isPlaying`
   - If Tone.js stopped unexpectedly, store wouldn't be notified
   - Manual sync required in multiple places

2. **RAF loop performance**: Position updates at ~60fps
   - Store updated every frame during playback
   - Potential performance issue with complex UI

3. **Volume sync only on mount**: Settings not reactive
   - AudioManager only synced once on component mount
   - External project loads wouldn't update AudioManager

4. **Snapshot-based note scheduling**: Notes during playback don't sound
   - Only scheduled on play button press
   - Notes added/edited during playback were silent

## Solution

### Event-Driven Architecture

Made **AudioManager the single source of truth** by implementing an event emitter pattern:

```typescript
// Event types
type AudioManagerEvent =
  | { type: "playStateChanged"; isPlaying: boolean }
  | { type: "positionChanged"; position: number };

// Subscribe to events
audioManager.subscribe((event) => {
  if (event.type === "playStateChanged") {
    setIsPlaying(event.isPlaying);
  } else if (event.type === "positionChanged") {
    setPlayheadPosition(event.position);
  }
});
```

### Changes Made

#### src/lib/audio.ts

1. **Added event emitter system**:
   - `subscribe(listener): unsubscribe` method
   - `emit(event)` private method
   - Event types: `playStateChanged`, `positionChanged`

2. **Internal position update loop**:
   - `startPositionUpdates()` - RAF loop managed by AudioManager
   - `stopPositionUpdates()` - cleanup
   - Only runs when playing (not constantly)

3. **State change emissions**:
   - `play()` emits `playStateChanged: true` and starts position updates
   - `pause()` emits `playStateChanged: false` and stops updates
   - `stop()` emits both state and position (reset to 0)

4. **Dynamic note scheduling**:
   - `updateNotesWhilePlaying(notes, tempo)` method
   - Re-schedules from current position if playing
   - Called reactively when notes/tempo change

#### src/components/transport.tsx

1. **Removed manual RAF loop**:
   - No more `rafRef` and `updatePosition` callback
   - Position updates come from AudioManager events

2. **Added event subscription**:

   ```typescript
   useEffect(() => {
     const unsubscribe = audioManager.subscribe((event) => {
       // Handle events
     });
     return unsubscribe;
   }, [setIsPlaying, setPlayheadPosition]);
   ```

3. **Reactive volume/metronome sync**:

   ```typescript
   useEffect(() => {
     audioManager.setAudioVolume(audioVolume);
   }, [audioVolume]);
   // Same for midiVolume, metronomeEnabled, metronomeVolume
   ```

4. **Reactive note scheduling**:

   ```typescript
   useEffect(() => {
     if (isPlaying) {
       audioManager.updateNotesWhilePlaying(notes, tempo);
     }
   }, [notes, tempo, isPlaying]);
   ```

5. **Simplified handlers**:
   - No more manual `setIsPlaying()` calls
   - Volume handlers only update store (effects handle sync)

## Benefits

### 1. Single Source of Truth ✅

- AudioManager owns playback state
- Store subscribes to changes
- No risk of desync

### 2. Better Performance ✅

- Position updates only when playing
- No constant 60fps polling
- Efficient requestAnimationFrame usage

### 3. Reactive Sync ✅

- Volume changes automatically propagate
- Project loads trigger re-sync
- No manual sync code needed

### 4. Dynamic Updates ✅

- Notes added during playback sound immediately
- Tempo changes re-schedule notes
- Live editing supported

## Testing

- ✅ All 37 E2E tests pass
- ✅ TypeScript compilation successful
- ✅ Lint checks pass
- ✅ Build successful
- ✅ CodeQL security scan: 0 alerts

## Follow-up Items

None - refactor is complete.

## Notes

- App.tsx still has initial volume sync after project load (before Transport mounts)
- This is intentional - ensures AudioManager is synced ASAP
- Transport reactive effects provide ongoing sync after mount
- Both approaches are safe and complementary
