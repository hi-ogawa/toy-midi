# Link audio offsets across tracks

## Problem

Multiple audio tracks are typically stems split from one recording (see stem ZIP import), so they share a single true alignment against the MIDI grid. Today each track's `offset` is dragged independently, which means aligning stems requires repeating the same drag N times, and a slightly missed drag silently de-syncs one stem from the others.

## Approach

Add a global "Link audio offsets" preference, analogous to `autoScrollEnabled`:

- `linkAudioOffsetsEnabled: boolean` in the project store, default `true`, persisted in `SavedProject` as an optional field (backward compatible, merged with defaults).
- Checkbox in Settings → Preferences next to Auto-scroll.
- When enabled, dragging any audio region applies the drag **delta** to all audio tracks, preserving relative offsets. When disabled, current single-track behavior.

Per-track lock flags or group ids are intentionally out of scope (over-engineering for this app).

## Clamping rule

Offsets must stay `>= 0`. In linked mode, clamp the **shared delta** so the minimum offset across all tracks lands at 0, rather than clamping tracks individually, because individual clamping would break the relative alignment the feature exists to protect.

## Implementation

- `project-store.ts`: new action `moveAudioOffset(id, offset)` — takes the dragged track's requested absolute offset, derives `delta = offset - track.offset`, and if linking is on (and more than one track) clamps delta to `-min(offsets)` and applies it to every track; otherwise updates just that track (clamped at 0). The drag handler in `WaveformArea` computes requests absolute from drag start, so per-event deltas self-correct after clamping.
- `piano-roll.tsx`: `WaveformArea`'s `onOffsetChange` (line ~1261) calls `moveAudioOffset(track.id, offset)` instead of `updateAudioTrack(track.id, { offset })`. The region component itself stays unaware of linking.
- `settings.tsx`: checkbox after Auto-scroll, label "Link audio offsets".
- Persistence: `SavedProject.linkAudioOffsetsEnabled?`, `DEFAULTS`, `toSavedProject`, `fromSavedProject`.

## Testing

- Unit (`src/stores/project-store.test.ts`, new file): `moveAudioOffset` with link on/off, delta application across tracks, shared-delta clamping at 0, single-track clamp.
- E2E (`e2e/audio-tracks.spec.ts`): load two audio files, drag one region right → both offsets move together; disable the setting, drag again → only the dragged track moves. Drag math: at default 80 px/beat and 120 BPM, 160 px = 1.0 s.

## Future (out of scope)

- Alt-drag to bypass the toggle for one-off single-stem nudges.
- Single undo entry for a linked move once audio undo lands (PRD TODO).
