# E2E Fixtures

All commands below run from the repository root.

## test-audio.wav

3-second mono 44.1 kHz 16-bit PCM sine at 440 Hz and ~-3 dB, with a 10 ms fade-out to avoid an end click:

```sh
ffmpeg -y -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=3" -af "volume=5.657,afade=t=out:st=2.99:d=0.01" -c:a pcm_s16le -bitexact e2e/fixtures/test-audio.wav
```

The `volume=5.657` compensates for ffmpeg's sine source generating at 1/8 full scale (8 x 0.7071 ~ -3 dB).

## test-midi.mid

C major arpeggio (C4, E4, G4 quarter notes, then a C4 half note) at 120 BPM in 4/4, velocity 0.8, on a track named "Test Track":

```sh
node --input-type=module -e 'import pkg from "@tonejs/midi"; import { writeFile } from "node:fs/promises"; const { Midi } = pkg; const midi = new Midi(); midi.header.tempos.push({ ticks: 0, bpm: 120 }); midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] }); midi.header.update(); const track = midi.addTrack(); track.name = "Test Track"; track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 }); track.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.8 }); track.addNote({ midi: 67, ticks: 960, durationTicks: 480, velocity: 0.8 }); track.addNote({ midi: 60, ticks: 1440, durationTicks: 960, velocity: 0.8 }); await writeFile("e2e/fixtures/test-midi.mid", Buffer.from(midi.toArray()));'
```

## test-stems.zip

Generated from `e2e/fixtures/test-audio.wav` with these entries in order:

1. `notes.txt`
2. `no_bass.wav`
3. `bass.wav`

```sh
node --input-type=module -e 'import { readFile, writeFile } from "node:fs/promises"; import JSZip from "jszip"; const wav = await readFile("e2e/fixtures/test-audio.wav"); const zip = new JSZip(); zip.file("notes.txt", "not audio"); zip.file("no_bass.wav", wav, { compression: "STORE" }); zip.file("bass.wav", wav, { compression: "STORE" }); await writeFile("e2e/fixtures/test-stems.zip", await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));'
```
