# E2E Fixtures

## test-tones.pcm

`test-tones.pcm` is raw f32le mono 22050 Hz PCM (the exact layout the Basic Pitch model consumes, accepted directly by `pnpm basic-pitch`) with C2/E2/G2 (MIDI 36/40/43) for 1s each, built from three harmonics plus a short attack/release envelope.

Regenerate it from the repository root with FFmpeg (`st(0,…)` holds the current note's frequency, `st(1,…)` the per-note time driving the envelope):

```sh
ffmpeg -hide_banner -loglevel error -f lavfi \
  -i "aevalsrc='st(0,440*pow(2,(if(lt(t,1),36,if(lt(t,2),40,43))-69)/12))*0+st(1,mod(t,1))*0+min(1,ld(1)/0.01)*min(1,(1-ld(1))/0.05)*(0.5*sin(2*PI*ld(0)*ld(1))+0.15*sin(4*PI*ld(0)*ld(1))+0.075*sin(6*PI*ld(0)*ld(1)))':s=22050:d=3" \
  -c:a pcm_f32le -f f32le e2e/fixtures/test-tones.pcm
```

## test-stems.zip

`test-stems.zip` is generated from `public/test-audio.wav` with these entries in order:

1. `notes.txt`
2. `no_bass.wav`
3. `bass.wav`

Regenerate it from the repository root with:

```sh
node --input-type=module -e 'import { readFile, writeFile } from "node:fs/promises"; import JSZip from "jszip"; const wav = await readFile("public/test-audio.wav"); const zip = new JSZip(); zip.file("notes.txt", "not audio"); zip.file("no_bass.wav", wav, { compression: "STORE" }); zip.file("bass.wav", wav, { compression: "STORE" }); await writeFile("e2e/fixtures/test-stems.zip", await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));'
```
