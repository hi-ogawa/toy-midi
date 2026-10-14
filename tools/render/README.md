# Offline Render Scripts

One-off scripts for rendering toy-midi projects outside the app with fluidsynth. They are a stopgap until a SpessaSynth-based renderer lives in the repo, so they do not match the app's synth exactly.

## Requirements

- Node.js
- `fluidsynth` and `ffmpeg` on `PATH`
- `python3` for `sfinfo.py`
- A SoundFont. `render.mjs` defaults to `~/.local/share/soundfonts/GeneralUser-GS.sf2`, and `--sf2` overrides it.

## Usage

Render each track, mix them with track gain and pan applied, and print integrated LUFS per track and for the mix:

```sh
node tools/render/render.mjs project.json
node tools/render/render.mjs '<share link with #p=...>' --out out/demo --sf2 path/to/font.sf2 --mp3
```

Output goes to `./out/<title>` by default. Beyond the app's project format, tracks can set `sf2` to use a different font and `nrpn` to offset SoundFont generators, and notes can set `art` (`h`, `p`, `b`, `r`) and `vib`, which are rendered as pitch bend.

List the presets in a SoundFont with their velocity layers and key ranges:

```sh
python3 tools/render/sfinfo.py path/to/font.sf2
```
