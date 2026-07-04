# Playback Speed (issue #140)

Slow down playback for more precise transcription, without changing the
musical tempo of the project.

- Issue: https://github.com/hi-ogawa/toy-midi/issues/140
- See the issue comment for the original design sketch (pitch-preserving
  time-stretch via AudioWorklet). This doc refines it after checking the
  actual code paths.

## Design summary

- New `playbackSpeed` state (default `1`), separate from project `tempo`.
  Session-only — not persisted in the project file, since it's a listening
  aid, not project data.
- Transport runs at effective BPM: `Tone.getTransport().bpm.value = tempo * playbackSpeed`.
  This automatically scales MIDI note scheduling (`midiPart` duration math in
  `src/lib/audio.ts` reads live transport BPM) and the metronome
  (`Tone.Sequence` is beat-based).
- Audio track: `player.playbackRate = playbackSpeed`, pitch-corrected later
  by a worklet (phase 3). At exactly 0.5x, plain playbackRate drops pitch by
  exactly one octave — same pitch classes, usable for transcription — so the
  MVP ships without the worklet, offering only `0.5x` / `1x`.

## Known sync pitfalls (found in code review)

Two places assume transport seconds map to song time at the musical tempo.
Both break once effective BPM != tempo:

1. **Playhead & playhead-relative actions.** `src/hooks/use-transport.ts`
   exposes `transport.seconds` (wall-clock), and the UI converts with
   `secondsToBeats(position, tempo)`:
   - `src/components/piano-roll.tsx` — playhead render (~line 338),
     paste at playhead (~439), add locator (~462)
   - `src/components/transport.tsx` — `formatBarBeat(position, tempo)` (~61)

   At 0.5x the playhead would move 2x too fast relative to notes.

2. **Audio track start offset.** `syncAudioTrack` in `src/lib/audio.ts` does
   `player.sync().start(offset)` — synced start times are transport
   _seconds_ (real time). At speed `s` the audio must start at
   `audioOffset / s` real seconds to stay aligned with beat-positioned notes.
   Also verify seek-while-synced with `playbackRate != 1`; Tone.js's synced
   Player offset scaling with playbackRate is historically fiddly.

## Implementation phases

### Phase 1 — beats-based playhead refactor (own PR, correct today)

**Status: implemented (statically verified only).**

Make the UI speed-independent by construction instead of threading
`playbackSpeed` through every seconds→beats conversion.

- `useTransport` returns position in **beats** derived from
  `Tone.getTransport().ticks / PPQ` (keep seconds too if needed for the
  time display; compute it from beats + tempo, not wall clock).
- Update all `secondsToBeats(position, tempo)` call sites in
  `piano-roll.tsx` / `transport.tsx` to use beats directly.
- `audioManager.seek()` callers: check whether seek inputs are derived from
  beats (piano roll click) and keep the conversion at the boundary.
- E2E: playhead position after seek/play matches note grid.

### Phase 2 — playbackSpeed MVP (no worklet)

**Status: implemented (statically verified only — `pnpm lint`; manual/E2E
verification pending).**

- `playbackSpeed` in the store (session-only), UI selector `0.5x` / `1x` in
  the transport bar (`data-testid="playback-speed-select"`).
- `applyState`: `bpm.value = tempo * playbackSpeed`;
  `player.playbackRate = playbackSpeed`.
- **Design deviation from the sketch above**: reading Tone.js v15 source
  (`Source.sync()` / `Player._start`) showed that synced-Player restarts
  compute buffer offsets in raw transport seconds, never scaled by
  `playbackRate` — so `player.sync().start(offset / speed)` would still
  misalign on every pause→resume and seek. Instead the player is now
  **unsynced** and `AudioManager` schedules it explicitly:
  - `startAudioPlayback()` computes the buffer offset from the transport
    position (`transport.seconds * playbackSpeed - audioOffset`) on every
    `play()`, `seek()`, speed change, and audio-offset change;
  - transport `stop`/`pause` events stop the player (alongside the existing
    `allNotesOff`);
  - `syncAudioTrack(offset)` now just records the offset and re-aligns if
    playing; `settings.tsx` no longer calls `player.sync()` directly.
- Manual check (TODO): imported song at 0.5x plays one octave down,
  notes/metronome/playhead/waveform-vs-audio all aligned; seek and
  pause→resume work; changing speed mid-playback stays aligned.
- E2E: selector + speed-independent seek tests added in
  `e2e/transport.spec.ts` ("Playback Speed" describe block, not yet run);
  the playhead-rate-at-0.5x test is a `test.skip` skeleton pending
  iteration against a running browser.

### Phase 3 — pitch-preserving worklet (arbitrary speeds)

- Insert a pitch-shift-up-by-`1/speed` AudioWorklet between `player` and
  `audioChannel` in `src/lib/audio.ts`. Real-time constraint: you cannot
  time-stretch a live stream longer than its input, so slow at the source
  (playbackRate) and correct pitch after — this is the standard chain.
- Library: [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch)
  — MIT, official JS/WASM build with AudioWorklet support; fits the existing
  oxisynth worklet/WASM packaging pattern (`src/assets/oxisynth/`).
  Avoid Rubber Band (GPL); `Tone.PitchShift`/`GrainPlayer` (granular) sound
  smeared but can serve as a throwaway quality baseline during the spike.
- Bypass the worklet entirely at 1x.
- Then widen the speed selector: `0.25x`, `0.5x`, `0.75x`, `1x`.

## Risks

- Worklet/WASM packaging and audio artifacts (phase 3) — isolated by the
  phasing; phases 1–2 carry all the app-level state/sync risk and are cheap.
- Tone.js synced-Player + playbackRate seek behavior needs empirical
  verification early in phase 2.
