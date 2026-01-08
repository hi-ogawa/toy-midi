# MIDI Playback

Play MIDI notes alongside backing track during transport playback.

## Problem

Notes in the piano roll need to produce sound:

1. **During playback** - notes play at their scheduled times synced with backing track
2. **On interaction** - note preview when adding/moving notes (immediate feedback)

## Reference: Tone.js

Key files from `refs/Tone.js/`:

- `examples/events.html` - Tone.Part for scheduling note sequences
- `examples/polySynth.html` - PolySynth for polyphonic playback
- `Tone/instrument/PolySynth.ts` - PolySynth API

### Tone.Part Pattern

From `examples/events.html`:

```javascript
const keys = new Tone.PolySynth(Tone.Synth).toDestination();

const part = new Tone.Part(
  (time, note) => {
    keys.triggerAttackRelease(note.pitch, note.duration, time);
  },
  [
    { time: "0:0", pitch: "C4", duration: "8n" },
    { time: "0:1", pitch: "E4", duration: "8n" },
  ],
).start(0);

Tone.Transport.start();
```

### Transport.scheduleOnce Pattern

For dynamic scheduling:

```javascript
Transport.scheduleOnce((time) => {
  synth.triggerAttackRelease("C4", "8n", time);
}, "1:0:0");
```

## Design

### Approach: Schedule on Play

Rather than keeping a persistent Part synced with note state, schedule notes fresh each time playback starts:

1. On play: Schedule all notes from current position to end
2. On pause: Cancel scheduled events
3. On seek: Reschedule from new position
4. On note change during playback: Reschedule affected notes

This is simpler than maintaining a synced Part and handles note edits during playback.

### AudioManager Changes

```typescript
class AudioManager {
  private synth: Tone.PolySynth | null = null;
  private scheduledEvents: number[] = []; // Transport event IDs

  async init() {
    // Use PolySynth for polyphony (multiple simultaneous notes)
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
    }).toDestination();
  }

  // Schedule notes for playback
  scheduleNotes(notes: Note[], fromSeconds: number, tempo: number) {
    this.clearScheduledNotes();

    for (const note of notes) {
      const startSeconds = beatsToSeconds(note.start, tempo);
      const durationSeconds = beatsToSeconds(note.duration, tempo);

      // Only schedule notes that start after current position
      if (startSeconds >= fromSeconds) {
        const eventId = Tone.getTransport().scheduleOnce((time) => {
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          this.synth?.triggerAttackRelease(freq, durationSeconds, time);
        }, startSeconds);
        this.scheduledEvents.push(eventId);
      }
    }
  }

  clearScheduledNotes() {
    for (const id of this.scheduledEvents) {
      Tone.getTransport().clear(id);
    }
    this.scheduledEvents = [];
  }

  // Immediate note preview (not synced to Transport)
  playNote(pitch: number, duration: number = 0.2) {
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.synth?.triggerAttackRelease(freq, duration);
  }
}
```

### Integration with Transport

```typescript
// In Transport component or useEffect
const handlePlay = () => {
  const currentSeconds = audioManager.position;
  audioManager.scheduleNotes(notes, currentSeconds, tempo);
  audioManager.play();
};

const handlePause = () => {
  audioManager.pause();
  audioManager.clearScheduledNotes();
};

const handleSeek = (seconds: number) => {
  audioManager.seek(seconds);
  if (isPlaying) {
    audioManager.scheduleNotes(notes, seconds, tempo);
  }
};
```

### Note Preview on Interaction

Already designed in AudioManager - `playNote()` for immediate feedback:

- On note creation (mousedown)
- On note move (drag start)
- On note resize (optional)

## Implementation Steps

1. [x] Add tempo input to transport bar (manual BPM entry)
2. [x] Upgrade synth to PolySynth in AudioManager
3. [x] Add `scheduleNotes()` and `clearScheduledNotes()` methods
4. [x] Call `scheduleNotes()` on play, reschedule on seek
5. [x] Clear scheduled notes on pause/stop
6. [x] Add note preview on mousedown (note creation)
7. [x] Add note preview on note drag start
8. [ ] Test with backing track to verify sync

## Files to Modify

| File                            | Changes                                       |
| ------------------------------- | --------------------------------------------- |
| `src/lib/audio.ts`              | PolySynth, scheduleNotes, clearScheduledNotes |
| `src/components/transport.tsx`  | Call scheduleNotes on play/seek               |
| `src/components/piano-roll.tsx` | Note preview on interaction                   |

## Considerations

### Polyphony

Use `PolySynth` to handle overlapping notes (e.g., chords). Default voice count is 32.

### Synth Sound

Start with basic `Synth` wrapped in `PolySynth`. Later can upgrade to:

- `MonoSynth` for bass-like sound
- `Sampler` for realistic instruments
- Custom synth patches

### Performance

Scheduling many notes at once should be fine - Transport handles this efficiently. If needed, could schedule in chunks (e.g., next 30 seconds) and schedule more as playback progresses.

### Note Changes During Playback

If user adds/moves/deletes notes while playing:

- Simple approach: Reschedule all notes (may cause brief audio glitch)
- Better approach: Only reschedule affected notes (more complex)

Start with simple approach, optimize if needed.

## Status

**Done** - MIDI playback implemented

### Completed

- Tempo input in transport bar (30-300 BPM)
- PolySynth for polyphonic playback
- Notes scheduled on play, cleared on pause
- Note preview on mousedown (creation and drag)

### Remaining

- Manual testing with backing track to verify sync
