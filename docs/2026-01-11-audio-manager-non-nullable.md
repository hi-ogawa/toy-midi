# Refactor AudioManager: Non-nullable Fields After init()

## Problem

AudioManager has nullable fields (`| null`) with null checks (`?.`, `if` guards) throughout the code. This is unnecessary since:

- `audioManager.init()` is guaranteed to be called before any usage
- The startup-screen in `app.tsx` ensures user gesture before app renders

## Approach

Use TypeScript's definite assignment assertion (`!`) for fields that are guaranteed to exist after `init()`.

### Fields to make non-nullable

All fields created in `init()`:

- `player!: Tone.Player` - Created early in init(), loaded later via `loadFromUrl()`
- `synth!: Tone.PolySynth`
- `metronome!: Tone.Synth`
- `metronomeSeq!: Tone.Sequence`
- `audioGain!: Tone.Gain`
- `midiGain!: Tone.Gain`
- `metronomeGain!: Tone.Gain`

### Fields removed

- `_initialized` - No longer needed since `init()` is guaranteed to be called first
- `_playerConnected` - No longer needed since player is connected in `init()`

## Implementation Steps

1. Change field declarations from `| null = null` to `!:` with definite assignment
2. Remove null checks (`?.` → `.`) for these fields
3. Remove `if` guards that check these fields
4. Run type check and lint

## Status

- [x] Task doc created
- [x] Implementation
- [x] PR created: https://github.com/hi-ogawa/toy-midi/pull/15
