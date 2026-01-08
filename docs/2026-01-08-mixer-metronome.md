# Mixer & Metronome

Add volume controls and metronome for better playback experience.

## Problem

Current playback needs refinement:

1. No way to balance audio vs MIDI volume
2. No metronome to help with timing/rhythm
3. Can't play MIDI without loading audio first

## Features

### 1. Volume Mixer

- Audio track volume slider
- MIDI synth volume slider
- Simple UI in transport bar or collapsible panel

### 2. Metronome

- Click sound on each beat (or configurable: quarter, eighth)
- Toggle on/off
- Separate volume control

### 3. MIDI-only Playback

- Allow play button when no audio loaded
- Just plays scheduled MIDI notes

## Design

### Tone.js Volume Control

```typescript
// Create gain nodes for mixing
const audioGain = new Tone.Gain(0.8).toDestination();
const midiGain = new Tone.Gain(0.8).toDestination();
const metronomeGain = new Tone.Gain(0.5).toDestination();

player.connect(audioGain);
synth.connect(midiGain);
metronomeSynth.connect(metronomeGain);

// Adjust volume (0-1)
audioGain.gain.value = 0.5;
```

### Metronome Implementation

```typescript
// Simple click synth
const metronome = new Tone.MembraneSynth({
  pitchDecay: 0.008,
  octaves: 2,
  envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
}).connect(metronomeGain);

// Schedule metronome clicks
const metronomeLoop = new Tone.Loop((time) => {
  metronome.triggerAttackRelease("C2", "32n", time);
}, "4n"); // quarter note

// Start/stop with transport
metronomeLoop.start(0);
```

### State Changes

```typescript
// Add to project-store
audioVolume: number; // 0-1, default 0.8
midiVolume: number; // 0-1, default 0.8
metronomeEnabled: boolean; // default false
metronomeVolume: number; // 0-1, default 0.5
```

## Implementation Steps

1. [x] Add gain nodes to AudioManager (audio, midi, metronome)
2. [x] Add volume state to project store
3. [x] Add volume sliders to transport UI
4. [x] Implement metronome synth and loop
5. [x] Add metronome toggle button
6. [x] Enable play without audio loaded (MIDI-only mode)
7. [ ] Test all combinations

## Files to Modify

| File                           | Changes                          |
| ------------------------------ | -------------------------------- |
| `src/lib/audio.ts`             | Gain nodes, metronome synth/loop |
| `src/stores/project-store.ts`  | Volume and metronome state       |
| `src/components/transport.tsx` | Volume sliders, metronome toggle |

## UI Sketch

```
[Load Audio] [▶] 0:00/0:00 [120] BPM [🔊] [M] | 🎵--○-- 🎹--○-- 🥁--○--
                                      ^    ^    ^        ^        ^
                                   master metro audio   midi   metronome
```

Simple approach: just audio and midi sliders + metronome toggle for now.

## Status

**Done** - Mixer and metronome implemented

### Completed
- Gain nodes for audio, MIDI, metronome
- Volume sliders in transport (Audio when loaded, MIDI always)
- Metronome toggle button
- MIDI-only playback (play without audio loaded)

### Remaining
- Manual testing
