# Offline Render

Render a Toy MIDI project to audio from a terminal, to hear it or measure its loudness, including fields the app doesn't play yet such as per-track SoundFonts and automation sequences. The renderer plays each MIDI track with fluidsynth, applies the track's gain and pan, mixes the tracks with mute, solo, and master gain, and prints integrated loudness per track and for the mix. Audio tracks and track EQ are not rendered.

The app plays MIDI with SpessaSynth, so a render with the same SoundFont is close to in-app playback but not identical.

## Requirements

- `fluidsynth` and `ffmpeg` on `PATH`
- Repository dependencies installed with `pnpm i`, for `tsx`
- The app's SoundFonts downloaded with `pnpm fetch-soundfonts`, which `pnpm dev` and `pnpm build` also run

## Render a Project

```sh
pnpm exec tsx tools/render/render.ts project.json
pnpm exec tsx tools/render/render.ts 'https://toy-midi.hiro18181.workers.dev/draft#p=...' --mp3
```

The input is a project JSON file, a share link, or a share link's `p` payload. The default SoundFont is the app's bundled GeneralUser GS, and `--sf2` replaces it. A track whose `soundfont` names one of the app's bundled fonts, such as `flamestudios-telecaster-bridge`, renders with that font, as in the app. Output goes to `.tmp/render/<title>` unless `--out` sets a directory, with a MIDI file, a dry WAV, and a WAV after gain and pan for each track, plus `00-mix.wav`. `--mp3` adds MP3 copies.

The renderer also reads track fields that the app doesn't play yet:

| Field              | Meaning                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| track `sf2`        | SoundFont path for this track instead of `--sf2`                                                                                                                                                          |
| track `automation` | Controller and pitch-bend sequences in the format proposed in https://github.com/hi-ogawa/toy-midi/issues/804, such as a hammer-on written as a pitch-bend step. Pitch bend uses a range of ±12 semitones |

## Inspect a SoundFont

List the presets of SF2 or SF3 files with their velocity layers, key ranges, and samples:

```sh
pnpm exec tsx tools/render/soundfont-info.ts font.sf2
```
