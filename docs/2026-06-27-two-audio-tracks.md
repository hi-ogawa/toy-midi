# Two Audio Tracks (#136)

## Problem

Support up to two audio tracks so users can transcribe against stem-split
sources (e.g. vocals + instrumental). Today the model is a singleton: one set of
`audio*` fields on `ProjectState`, one `Tone.Player`/`Tone.Channel` in
`AudioManager`, one waveform lane.

## Approach

Generalize the singleton audio model into an id-based array, then generalize
rendering/playback/persistence/project-file over it. User-facing limit stays at
two tracks (`MAX_AUDIO_TRACKS`).

### Data model (`src/stores/project-store.ts`)

- `SavedAudioTrack`: `{ id, fileName, assetKey, duration, offset, volume, muted }`
  (persisted).
- `AudioTrack = SavedAudioTrack & { audioView: AudioView | null }` (runtime;
  `audioView` is transient).
- `ProjectState`: drop singleton `audio*` fields; add
  `audioTracks: AudioTrack[]` and non-persisted `selectedAudioTrackId`.
- Actions: `addAudioTrack`, `updateAudioTrack(id, updates)`,
  `deleteAudioTrack(id)`, `selectAudioTrack(id | null)`.
- Persistence: `SavedProject.audioTracks: SavedAudioTrack[]`; migrate legacy
  singleton fields into a one-element array (`migrateSavedAudioTracks`). Bump
  `STORAGE_VERSION` to 2. Reset `selectedAudioTrackId` + per-track `audioView`
  on load.

### Playback (`src/lib/audio.ts`)

- `AudioManager` keeps `Map<trackId, { player, channel }>`.
- `setTrackBuffer(id, buffer)`, `syncAudioTrack(id, offset)`,
  `setTrackVolume(id, v)`, `setTrackMuted(id, m)`, `removeAudioTrack(id)`.
- `applyState` diffs `audioTracks` by id: create/update/remove players, sync each
  to the Transport at its own offset.

### UI

- `piano-roll.tsx`: render one left-panel control block + one `WaveformArea`
  lane per track (`audioTracks.map`). Per-track mute/volume/offset/select/delete
  via id. Grid/keyboard layout offset uses `waveformHeight * audioTracks.length`.
- `mixer.tsx`: one audio channel strip per track (extracted component for the
  dB draft-input hook).
- `settings.tsx`: list loaded tracks with per-track remove; "Load Audio" adds a
  track, disabled at `MAX_AUDIO_TRACKS`.
- `transport.tsx`: `Shift+2` toggles the first audio track's mute.
- `app.tsx`: on init, load each track's buffer from its `assetKey`.

### Project file (`src/lib/project-file.ts`)

- `manifest.files.audio` becomes `Array<{ trackId, path }>` (formatVersion 2).
- Export bundles each track's asset under `audio/<trackId>-<fileName>`; strip
  `assetKey` on export. Import maps bundled files back to track ids and re-saves
  assets. Accept legacy v1 (single audio path + legacy project.json) via the
  same `migrateSavedAudioTracks` normalization.

## Tests

- Update `mute-shortcuts.spec.ts` to read `audioTracks[0].muted` and load audio
  where audio mute is asserted.
- Existing `transport.spec.ts` / `settings-export.spec.ts` audio tests rely on
  `.bg-emerald-700` region + `load-audio-button` / `remove-audio-button`
  testids; keep those stable (per-track remove buttons reuse the testid).
- Add a two-track E2E (`audio-tracks.spec.ts`): load two files, two lanes,
  independent mute, remove one.
