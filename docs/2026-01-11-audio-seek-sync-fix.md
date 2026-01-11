# Audio Seek & State Sync Fix

**Date:** 2026-01-11
**Status:** Planning

## Framing

**Tone.Transport is the source of truth** for playback state (playing/stopped/paused, position).

`useTransport` is a **React subscriber** that reflects Transport state to UI. It doesn't "own" state - it just bridges Tone.js events to React state updates.

The bug is: we're missing the timing/event to reflect position changes to React.

---

## Immediate Fix

### Missing `"ticks"` Event

Transport emits `"ticks"` when position changes while stopped. We weren't listening:

```typescript
// Add to useTransport
transport.on("ticks", () => setPosition(transport.seconds));
```

This is a quick fix for the "playhead doesn't jump when paused" bug.

### Remove `position` from `handlePlayPause` deps

Get position from Transport directly to avoid stale state and 60fps callback recreation:

```typescript
const handlePlayPause = useCallback(() => {
  if (!isPlaying) {
    const currentPosition = Tone.getTransport().seconds;
    audioManager.scheduleNotes(notes, currentPosition, tempo);
    audioManager.play();
  } else {
    audioManager.pause();
    audioManager.clearScheduledNotes();
  }
}, [isPlaying, notes, tempo]);
```

---

## Open Questions (Follow-up)

These need deeper investigation. Our current Tone.js usage might be subtly wrong.

### 1. Position Change Detection

Is relying on `"ticks"` + RAF the right pattern? Or is there a better Tone.js idiom?

- `"ticks"` only fires when stopped
- During playback we use RAF polling
- Is there a more unified approach?

### 2. Seek API

We use `transport.seconds = x`. Is this the right API?

- Does Tone.js have a dedicated seek method?
- What's the expected behavior when seeking while playing vs stopped?

### 3. Player Sync Pattern

The pause→unsync→resync→resume dance in `setOffset()` feels fragile:

```typescript
if (wasPlaying) transport.pause();
this.player.unsync();
this.player.sync().start(0, this._offset);
if (wasPlaying) transport.start();
```

Questions:

- Is `player.seek()` more appropriate for offset changes?
- Are there race conditions in this pattern?
- How do other Tone.js apps handle audio alignment?

### 4. Metronome Sequence Pattern

Similar smell to player sync. The metronome uses `Tone.Sequence` with manual alignment:

```typescript
this.metronomeSeq = new Tone.Sequence(callback, [1, 0, 0, 0], "4n");

// On enable, calculate next measure boundary
const nextMeasure = Math.ceil(position / secondsPerMeasure) * secondsPerMeasure;
this.metronomeSeq.start(nextMeasure);
```

Questions:

- Is manual measure alignment the right pattern, or does Tone.js handle this?
- Should we use `Tone.Loop` instead of `Tone.Sequence`?
- The "lag" on metronome toggle - is this inherent to the pattern or fixable?
- Hardcoded 4/4 time signature - how to handle other signatures?

### 5. Reference Patterns

We should look at:

- Other Tone.js DAW/sequencer examples
- How Signal (refs/signal) handles transport sync
- Tone.js examples in refs/Tone.js

---

## Verified Patterns

From Tone.js source research, these are confirmed correct:

| Pattern                             | Status                        |
| ----------------------------------- | ----------------------------- |
| `transport.seconds = x` for seeking | ✅ Standard                   |
| `player.sync().start(time, offset)` | ✅ Idiomatic                  |
| RAF for position during playback    | ✅ No continuous event exists |

---

## Status

### Immediate

- [ ] Add `"ticks"` event listener to useTransport
- [ ] Remove `position` from handlePlayPause deps
- [ ] Test: seek while paused, seek while playing, MIDI scheduling

### Follow-up (Separate Task)

- [ ] Research position change patterns in Tone.js ecosystem
- [ ] Evaluate player sync patterns (seek vs unsync/resync)
- [ ] Evaluate metronome/sequence patterns (Loop vs Sequence, alignment)
- [ ] Review reference projects for idioms we might be missing

---

## Feedback Log

**2026-01-11:** Initial analysis framed useTransport as "owning" state - this was wrong. Reframed: Tone.Transport is source of truth, useTransport is subscriber. Immediate fix is adding `"ticks"` listener, but larger questions about Tone.js idioms remain open for follow-up.
