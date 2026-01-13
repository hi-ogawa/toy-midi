# Audio Time Units: Beats, Ticks, Seconds, Frames

Understanding the different time representations in audio software is essential for building reliable sequencers and DAWs.

## Overview

| Unit        | Type    | Relative To           | Primary Use                    |
| ----------- | ------- | --------------------- | ------------------------------ |
| **Beats**   | Float   | Tempo                 | Musical editing, UI display    |
| **Ticks**   | Integer | Tempo                 | MIDI files, exact subdivisions |
| **Seconds** | Float   | Absolute (wall clock) | Audio scheduling, playback     |
| **Frames**  | Integer | Sample rate           | DSP processing                 |

## The Two Domains

```
Musical Domain                    DSP Domain
(human perception)                (digital audio)
──────────────────────────────────────────────────
Beats, Bars, Ticks                Seconds, Frames
Tempo-relative                    Absolute time
Grid-aligned                      Continuous/quantized
```

## Beats (Float)

**What**: Fractional quarter notes (or other beat units based on time signature).

**Example**: At 4/4 time, beat 2.5 = halfway through beat 3.

```typescript
interface Note {
  start: number; // beats (e.g., 0, 0.5, 1, 1.5)
  duration: number; // beats (e.g., 1 = quarter, 0.5 = eighth)
}
```

**Pros**:

- Intuitive for musicians
- Scales with tempo changes
- Easy grid snapping (beat % gridSize)

**Cons**:

- Some subdivisions are inexact (triplets = 0.333...)

## Ticks (Integer)

**What**: High-resolution integer pulses, defined by PPQ (Pulses Per Quarter note).

**Example**: At PPQ=480, one beat = 480 ticks.

```
Common PPQ values:
  24   - Basic (legacy MIDI)
  96   - Standard
  480  - High resolution (common in DAWs)
  960  - Very high resolution
```

**Why ticks exist**: Exact integer representation of any musical subdivision.

```javascript
// Float beats: infinite decimals
1/3 beat = 0.33333...   // triplet

// Ticks (PPQ=480): exact integers
1/3 beat = 160 ticks    // clean
2/3 beat = 320 ticks    // clean
3/3 beat = 480 ticks    // clean
```

**MIDI file format** uses ticks with delta-time encoding:

```
Header: PPQ = 480
Events:
  delta=0    note_on  C4
  delta=480  note_off C4   (1 beat later)
  delta=0    note_on  E4   (same time as C4 off)
  delta=240  note_off E4   (half beat later)
```

**Key property**: Ticks are tempo-relative, not time-relative.

```
480 ticks at 120 BPM = 0.5 seconds
480 ticks at  60 BPM = 1.0 seconds
480 ticks at 240 BPM = 0.25 seconds
```

## Seconds (Float)

**What**: Absolute wall-clock time in floating-point seconds.

**Example**: A note at 1.5 seconds plays 1.5 seconds after start, regardless of tempo.

```javascript
// Convert beats to seconds
const seconds = (beats / bpm) * 60;

// Tone.js Transport provides both
Tone.Transport.seconds; // current time in seconds
Tone.Transport.position; // current time in bars:beats:sixteenths
```

**Why seconds are the source of truth for audio**:

- Human perception is time-based, not sample-based
- Sample rate is an implementation detail (44.1k, 48k, 96k)
- Audio APIs (Web Audio, CoreAudio) schedule in seconds

**Precision**: IEEE 754 double-precision floats have ~15-17 significant digits. For a 1-hour piece, precision is ~1 nanosecond - far beyond audible or relevant.

## Frames (Integer)

**What**: Discrete audio samples, determined by sample rate.

**Example**: At 48kHz, frame 48000 = 1 second into the audio.

```
Sample rates:
  44100 Hz - CD quality
  48000 Hz - Professional audio, video
  96000 Hz - High-resolution audio
```

**Why frames are integers**: Digital audio is fundamentally discrete. Each frame is one amplitude value (per channel) at a specific point in time.

```javascript
// Convert seconds to frames
const frame = Math.round(seconds * sampleRate);

// Frame duration
const frameDuration = 1 / 48000; // ~0.0000208 seconds = 20.8 microseconds
```

**Key insight**: Frames are a **quantization artifact** of digital audio, not a musical concept. The music shouldn't change if you render at 48kHz vs 96kHz.

## Conversion Flow

The correct pattern: keep musical data in beats/seconds, convert to frames only at the DSP boundary.

```
Storage/UI          Scheduling           DSP
─────────────────────────────────────────────────
Beats (float)  →  Seconds (float)  →  Frames (int)
    ↑                                      ↓
    │         Never convert back           │
    └──────────────────────────────────────┘
```

**Why one-way conversion**: Converting frames back to seconds/beats accumulates quantization error. Always derive frames from the authoritative float value.

```javascript
// Good: derive frames from seconds
const startFrame = Math.round(startSeconds * sampleRate);
const endFrame = Math.round(endSeconds * sampleRate);

// Bad: derive end from start + duration in frames
const startFrame = Math.round(startSeconds * sampleRate);
const durationFrames = Math.round(durationSeconds * sampleRate);
const endFrame = startFrame + durationFrames; // potential off-by-one
```

## Precision Considerations

### Float Precision (Seconds, Beats)

IEEE 754 double-precision: ~15-17 significant digits.

```
1 second with max precision: 1.0000000000000000 (16 digits)
Error at 1 second:           ~1e-16 seconds = 0.0001 picoseconds

1 audio frame at 48kHz:      ~20.8 microseconds = 2e-5 seconds

Margin: 10+ orders of magnitude - float precision is not a concern.
```

### Integer Overflow (Ticks, Frames)

At 48kHz, a 32-bit signed integer overflows after:

```
2^31 / 48000 / 3600 ≈ 12.4 hours
```

For longer pieces, use 64-bit integers or BigInt.

## When to Use Each

| Scenario                  | Use                                   |
| ------------------------- | ------------------------------------- |
| Note storage, UI display  | Beats (float)                         |
| MIDI file I/O             | Ticks (integer)                       |
| Audio scheduling, Tone.js | Seconds (float)                       |
| AudioWorklet processing   | Frames (integer)                      |
| Triplets, complex tuplets | Ticks (exact) or Beats (approximate)  |
| Tempo changes             | Beats/Ticks (they scale), not Seconds |

## Example: This Project

```typescript
// Storage: beats (float)
interface Note {
  start: number; // beats
  duration: number; // beats
}

// Scheduling: seconds (float) - derived from beats
const startSeconds = time; // from Tone.Part callback
const endSeconds = time + (duration / bpm) * 60;

// DSP: frames (integer) - derived from seconds
const startFrame = Math.round(startSeconds * sampleRate);
const endFrame = Math.round(endSeconds * sampleRate);
```

## References

- [MIDI 1.0 Specification](https://midi.org/midi-1-0-detailed-specification) - Tick/PPQ definitions
- [Web Audio API](https://webaudio.github.io/web-audio-api/) - AudioContext time model
- [Tone.js Transport](https://tonejs.github.io/docs/14.7.77/Transport) - Time representations
