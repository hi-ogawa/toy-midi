# Audio Tracks Phase 1

## Problem Context

Issue #136 needs support for two audio tracks for stem-split transcription. The first implementation slice should move the store and persistence model away from singleton audio fields while preserving the current one-track behavior.

## Approach

- Replace singleton audio state with `audioTracks: AudioTrack[]` and `selectedAudioTrackId`.
- Use id-based audio mutations immediately.
- Keep remaining UI and audio manager behavior explicitly pointed at `audioTracks[0]` for this phase.
- Split persisted `SavedAudioTrack` from runtime `AudioTrack` so waveform data remains transient.
- Migrate old saved singleton audio fields into a one-element `audioTracks` array.

## Follow-up

The next phase should replace remaining `audioTracks[0]` boundaries with multi-lane UI rendering and per-track `AudioManager` players/channels.
