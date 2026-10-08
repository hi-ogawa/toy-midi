# Toy MIDI recorder

`app` is the open recorder project.

- `app.runtime` owns the project state and playback. Read state with `app.runtime.store.get()`, and change it only through runtime methods, so playback and undo stay in sync.
- `app.project()` returns the editor's save state: `dirty`, `saving`, `saveStatus`, and `save()`. Edits are not saved until `save()` is called.

## State

`app.runtime.store.get()` returns, among other fields:

- `title`, `tempo` (bpm), `timeSignature` (`{ numerator, denominator }`)
- `position` in seconds, and `isPlaying`
- `loop`: `{ enabled, range?: { startBeat, endBeat } }`
- `midiTracks`: `{ id, name, program, notes, gain, muted, soloed }[]`, where `program` is a General MIDI program number (0 to 127)
- `audioTracks`: recorded audio, which holds large buffers, so select fields instead of returning it whole

A note is `{ id, pitch, start, duration, velocity }`. `pitch` is a MIDI note number (60 is middle C), `start` and `duration` are in beats from the start of the project, and `velocity` is 0 to 127. `id` is any unique string, such as `crypto.randomUUID()`.

## Methods

- `await addMidiTrack({ program })` appends a track. Its id is the last entry of `midiTracks`.
- `setMidiTrackNotes(id, notes)` replaces all of a track's notes.
- `await setMidiTrackProgram(id, program)`, `setTrackName({ id, name })`, `removeMidiTrack(id)`
- `setTrackMix(id, { gain, muted, soloed })`, with any subset of the fields
- `await play()`, `pause()`, and `seek(seconds)`. Convert beats to seconds with `beats * 60 / tempo`.
- `setLoop({ enabled, range: { startBeat, endBeat } })`
- `setTempo(bpm)`, `setTimeSignature({ numerator, denominator })`, `setTitle(title)`

## Examples

Write a bass line on a new track and loop it:

```js
const { runtime } = app;
await runtime.addMidiTrack({ program: 33 });
const id = runtime.store.get().midiTracks.at(-1).id;
const roots = [45, 38, 43, 36];
runtime.setMidiTrackNotes(
  id,
  roots.map((pitch, bar) => ({
    id: crypto.randomUUID(),
    pitch,
    start: bar * 4,
    duration: 3.5,
    velocity: 100,
  })),
);
runtime.setLoop({ enabled: true, range: { startBeat: 0, endBeat: 16 } });
runtime.seek(0);
await runtime.play();
```

Summarize the tracks:

```js
return app.runtime.store
  .get()
  .midiTracks.map(({ id, name, program, notes }) => ({
    id,
    name,
    program,
    notes: notes.length,
  }));
```
