# Offline Render

Render a Toy MIDI project to audio from a terminal, to hear it or measure its loudness, including fields the app doesn't play yet such as per-track SoundFonts and guitar articulations. The renderer plays each MIDI track with fluidsynth, applies the track's gain and pan, mixes the tracks with mute, solo, and master gain, and prints integrated loudness per track and for the mix. Audio tracks and track EQ are not rendered.

The app plays MIDI with SpessaSynth, so a render with the same SoundFont is close to in-app playback but not identical.

## Requirements

- `fluidsynth` and `ffmpeg` on `PATH`
- Repository dependencies installed with `pnpm i`, for `tsx`

## Render a Project

```sh
pnpm exec tsx tools/render/render.ts project.json
pnpm exec tsx tools/render/render.ts 'https://toy-midi.hiro18181.workers.dev/draft#p=...' --mp3
```

The input is a project JSON file, a share link, or a share link's `p` payload. The default SoundFont is the app's bundled GeneralUser GS, and `--sf2` replaces it. Output goes to `.tmp/render/<title>` unless `--out` sets a directory, with a MIDI file, a dry WAV, and a WAV after gain and pan for each track, plus `00-mix.wav`. `--mp3` adds MP3 copies.

The renderer also reads track and note fields that the app doesn't play yet, for experiments such as guitar parts:

| Field        | Meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| track `sf2`  | SoundFont path for this track instead of `--sf2`                                                        |
| track `nrpn` | SoundFont generator number to an offset in -8192..8191, such as `{ "38": -2000 }` for a shorter release |
| note `art`   | `h` hammer-on, `p` pull-off, `b` bend, or `r` release, played as pitch bend on a monophonic track       |
| note `bend`  | Semitones a `b` note bends up from, 2 by default                                                        |
| note `vib`   | Vibrato depth in cents                                                                                  |

## Inspect a SoundFont

List the presets of SF2 or SF3 files with their velocity layers, key ranges, and samples:

```sh
pnpm exec tsx tools/render/soundfont-info.ts font.sf2
```
