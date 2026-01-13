# Fix Note-Off/Note-On Ordering for Repeated Notes

## Problem

When two notes of the same pitch are adjacent (one ends exactly when the next begins), the sound may cut off prematurely or behave unexpectedly.

**Symptom**: Repeating the same note in sequence produces inconsistent playback - sometimes notes are silent or cut short.

**Location**: `src/lib/audio.ts:207-224` (TODO comment)

## Root Cause Analysis

### Current Flow

1. `Tone.Part` schedules notes via callback (float seconds)
2. Callback calls `triggerAttackRelease()` which sends `noteOnOff` message to worklet
3. Worklet immediately triggers `note_on` at `currentFrame` and schedules `note_off` for `currentFrame + durationSamples`

### Precision Loss at Float→Int Boundary

The worklet operates on integer frames (as any DSP must), but the timing arrives via floating-point conversions:

```
Note.duration (beats, float)
    ↓
durationSeconds = (duration / bpm) * 60  (float)     ← audio.ts:209
    ↓
durationSamples = Math.round(duration * sampleRate)  ← oxisynth-synth.ts:143
    ↓
note_off frame = currentFrame + durationSamples      ← worklet.js:505
```

For **one note**, this is fine. But for **adjacent notes**, each note's callback fires independently via Tone.Part, and each computes timing from its own float→int conversion.

### The Frame Flip Problem

For adjacent same-pitch notes (e.g., beat 0-1 and beat 1-2 at 120 BPM, 48kHz):

```
Note 1: start=0, duration=1
  - Tone.Part fires at T1, worklet receives at currentFrame=F1
  - note_off scheduled at F1 + 24000

Note 2: start=1, duration=1
  - Tone.Part fires at T2, worklet receives at currentFrame=F2
  - note_on happens immediately at F2
```

**Expected**: F2 == F1 + 24000 (note_off and note_on at same frame)
**Actual**: Due to float scheduling drift, F2 might be F1 + 23999 or F1 + 24001

If F2 < (F1 + 24000):

1. Note 2's `note_on` fires first (when message received)
2. Note 1's `note_off` fires later (in `process()` when frame threshold reached)
3. Result: **note_on(pitch) → note_off(pitch)** = sound stops immediately

### Why This Happens

The two notes' timings are computed **independently**:

- Note 1's note_off frame: based on when Note 1's message was received + duration
- Note 2's note_on frame: based on when Note 2's message is received

There's no guarantee these align because Tone.js schedules callbacks in float seconds, and the `currentFrame` when each message is processed can drift.

### MIDI Standard Reference

- MIDI spec doesn't define ordering for same-tick events
- DAWs typically ensure Note-Off before Note-On for same-tick, same-pitch
- Software synths often use "voice stealing": force release when note_on arrives for active note

## Verifying the Frame Flip

Add logging to confirm the issue:

### In worklet.js

```js
case "noteOnOff":
  console.log(`[worklet] noteOn key=${msg.key} frame=${currentFrame} duration=${msg.durationSamples} noteOffAt=${currentFrame + msg.durationSamples}`);
  soundfontPlayer?.note_on(msg.key, msg.velocity ?? 127);
  this.scheduledNoteOffs.push({
    key: msg.key,
    frame: currentFrame + msg.durationSamples,
  });
  break;

// In process(), inside the filter:
if (currentFrame >= event.frame) {
  console.log(`[worklet] noteOff key=${event.key} frame=${currentFrame} scheduledAt=${event.frame}`);
  soundfontPlayer.note_off(event.key);
  return false;
}
```

### What to Look For

Create two adjacent C4 notes (pitch 60) at beats 0-1 and 1-2, then play:

```
# Good (note_off before or same frame as next note_on):
[worklet] noteOn key=60 frame=0 duration=24000 noteOffAt=24000
[worklet] noteOff key=60 frame=24000 scheduledAt=24000
[worklet] noteOn key=60 frame=24000 duration=24000 noteOffAt=48000

# Bad (note_on before note_off - frame flip):
[worklet] noteOn key=60 frame=0 duration=24000 noteOffAt=24000
[worklet] noteOn key=60 frame=23987 duration=24000 noteOffAt=47987  ← FLIP! note_on before previous note_off
[worklet] noteOff key=60 frame=24000 scheduledAt=24000              ← kills the new note
```

The "bad" case shows Note 2's `noteOn` arriving at frame 23987, before Note 1's scheduled `noteOff` at frame 24000.

## Solution Options

### Option 1: Voice Stealing in Worklet (Recommended)

Cancel pending note-off when new note-on arrives for same key.

**File**: `src/assets/oxisynth/worklet.js`

```js
case "noteOnOff":
  // Cancel any pending note-off for this key (voice stealing)
  this.scheduledNoteOffs = this.scheduledNoteOffs.filter(e => e.key !== msg.key);
  soundfontPlayer?.note_on(msg.key, msg.velocity ?? 127);
  this.scheduledNoteOffs.push({
    key: msg.key,
    frame: currentFrame + msg.durationSamples,
  });
  break;
```

**Pros**:

- Single location fix
- Handles all edge cases
- Matches real synthesizer behavior

**Cons**:

- Slightly different behavior (abruptly cuts previous note's release)

### Option 2: Add Gap Between Adjacent Notes

Pre-process notes in `setNotes()` to add tiny gap between same-pitch adjacent notes.

```typescript
const MIN_GAP_BEATS = 0.01; // ~6ms at 100 BPM
// Detect and shorten first note when adjacent same-pitch notes found
```

**Pros**: Ensures clean separation at source

**Cons**: Modifies timing, more complex logic

### Option 3: Separate Note-On/Note-Off with Sorted Events

Build explicit event list with on/off events, sorted by time then type (off before on).

**Pros**: Proper MIDI-style event ordering

**Cons**: Major refactor of scheduling approach

### Option 4: Use Absolute Frame Scheduling from `time` Parameter

Currently we ignore the `_time` parameter in the Tone.Part callback. This is the **precise audio context time** (in seconds) when the event should occur. By using it to compute absolute frames for both note-on and note-off, we ensure they share the same source of truth.

**Changes required**:

1. **audio.ts** - Pass absolute times instead of duration:

```typescript
(time, event) => {
  const endTime = time + (event.duration / Tone.getTransport().bpm.value) * 60;
  this.midiSynth.scheduleNoteOnOff(event.pitch, time, endTime, 100);
};
```

2. **oxisynth-synth.ts** - Convert to absolute frames:

```typescript
scheduleNoteOnOff(noteNumber: number, startTime: number, endTime: number, velocity: number): void {
  const startFrame = Math.round(startTime * this.context.sampleRate);
  const endFrame = Math.round(endTime * this.context.sampleRate);
  this.postMessage({
    type: "scheduleNoteOnOff",
    key: noteNumber,
    velocity,
    startFrame,
    endFrame,
  });
}
```

3. **worklet.js** - Schedule both note-on and note-off:

```js
case "scheduleNoteOnOff":
  this.scheduledNoteOns.push({ key: msg.key, velocity: msg.velocity, frame: msg.startFrame });
  this.scheduledNoteOffs.push({ key: msg.key, frame: msg.endFrame });
  break;

// In process(), handle both queues with proper ordering:
// Process note-offs BEFORE note-ons at the same frame
```

**Result**:

- Note 1 at beat 0-1: startFrame=0, endFrame=24000
- Note 2 at beat 1-2: startFrame=24000, endFrame=48000
- Both computed from `time`, ensuring note-off and next note-on share exact same frame

**Pros**:

- Fixes root cause (single source of truth for timing)
- Sample-accurate scheduling
- Proper MIDI-style timing

**Cons**:

- Requires changes in 3 files
- Worklet must process note-offs before note-ons at same frame (ordering guarantee needed)
- Lookahead needed: Tone.Part fires callbacks ~100ms early, so we're scheduling future frames

**Note**: Even with this fix, the worklet needs to guarantee note-off before note-on ordering at the same frame. This can be done by:

- Processing scheduled note-offs first in `process()`
- Sorting events by frame, then type (off < on) when multiple events at same frame

## Implementation Plan

1. ~~Implement Option 1 (voice stealing in worklet)~~ → Implemented Option 4 instead
2. Add comment explaining the behavior
3. Test with repeated same-pitch notes
4. Remove TODO comment from `audio.ts`

## Test Cases

- [ ] Single note plays correctly
- [ ] Two adjacent same-pitch notes both sound (e.g., C4 at beat 0-1, C4 at beat 1-2)
- [ ] Rapid repeated notes (e.g., 16th notes) all trigger
- [ ] Overlapping different pitches still work correctly
- [ ] Note preview still works

## Reference Files

- `src/lib/audio.ts` - AudioManager, uses `scheduleNoteOnOff()` with absolute times
- `src/lib/oxisynth-synth.ts` - OxiSynthSynth wrapper, new `scheduleNoteOnOff()` method
- `src/assets/oxisynth/worklet.js` - AudioWorklet processor, `scheduleNoteOnOff` handler

## Status

- [x] Investigation complete
- [x] Implementation (Option 4: absolute frame scheduling)
- [ ] Testing
- [x] TODO comment cleanup

## Additional Notes (2026-01-13)

### Defense-in-Depth: Voice Stealing

The current implementation handles the ordering correctly for the `scheduleNoteOnOff` path by processing note-offs before note-ons at the same frame. However, consider adding **voice stealing** as a belt-and-suspenders measure:

```js
case "scheduleNoteOnOff":
  // Voice stealing: cancel pending note-off for same key
  // This handles edge cases like tempo changes or transport seeking
  this.scheduledNoteOffs = this.scheduledNoteOffs.filter(e => e.key !== msg.key);
  this.scheduledNoteOns.push({ ... });
  this.scheduledNoteOffs.push({ ... });
  break;
```

**When this helps:**
- Tempo changes during playback (absolute frames computed at old tempo)
- Transport seeking (stale scheduled events)
- Any race condition we haven't anticipated

**Trade-off:** Abruptly cuts previous note's release tail instead of letting it complete. For most instruments this is imperceptible or even desirable (re-trigger behavior).

### Legacy `noteOnOff` Path

The `noteOnOff` message type (used by `triggerAttackRelease()` for note preview) still has the original race condition. This is acceptable for preview (single notes), but if it's ever used for sequenced playback, the issue would resurface. Consider:

1. Documenting this limitation in the code
2. Or applying voice stealing to `noteOnOff` as well

## Float Precision Analysis

After implementing Option 4, the remaining question: could float precision errors in the `Math.round(seconds * sampleRate)` conversion cause a 1-frame flip?

### The Math

At 48kHz sample rate:
- 1 frame = ~0.0000208 seconds (20.8 microseconds)

JavaScript uses IEEE 754 double-precision floats with ~15-17 significant decimal digits.

### Conversion Chain (Post-Fix)

```
Note 1: start=1 beat, duration=1 beat (at 120 BPM)
  time1 = T (from Tone.Part, e.g., 0.5 seconds)
  endTime1 = T + (1 / 120) * 60 = T + 0.5

Note 2: start=2 beats
  time2 = scheduled by Tone.js for beat 2
```

For a frame flip to occur:
```
Math.round(endTime1 * 48000) > Math.round(time2 * 48000)
```

### Why It's Practically Impossible

For a 1-frame difference, we'd need ~20μs (1e-5 seconds) of error.

Float precision errors are typically ~1e-15 relative. For a 1-second value:
- Float error ≈ 1e-15 seconds
- Required error for 1-frame flip ≈ 1e-5 seconds
- **Difference: 10 orders of magnitude**

The float error would need to be ~10 billion times larger than typical IEEE 754 double precision errors to cause a 1-frame flip.

### Remaining Theoretical Risk

The only potential issue is if Tone.js's beat→seconds conversion differs from our duration→seconds calculation. But this would be a **consistent offset** (a bug in the math), not random float drift. Such a bug would be immediately obvious in testing.

### Conclusion

**Float precision cannot practically cause frame flips.** The original bug was caused by using completely independent timing sources (worklet's `currentFrame` at message receipt vs. scheduled note-off frame). The fix using absolute times from Tone.Part's `time` parameter eliminates this by deriving both times from the same source.
