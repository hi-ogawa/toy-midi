# Toy MIDI CLI

`toy-midi` runs Toy MIDI features from the command line. It drives the real Toy MIDI app in headless Chromium, so the output matches what the app produces interactively.

## Install

The CLI installs directly from GitHub without cloning the repository.

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/cli"
```

It also needs a Playwright Chromium build. When it is missing, the CLI prints the exact install command, which has the form `npx playwright-core@<version> install chromium --no-shell`.

By default, every command runs against the deployed app at https://toy-midi.hiro18181.workers.dev. Pass `--url` to use another one, such as a local dev server.

## `score-video`

`score-video` renders a MusicXML score into a silent scrolling score video, for use as a score layer in a video editor. It steps the score viewer frame by frame and screenshots it, so the cursor, scrolling, and score settings match interactive playback. It needs `ffmpeg` on `PATH` for encoding.

### Usage

```sh
toy-midi score-video score.musicxml score.mp4
```

Export the MusicXML from a MIDI track with the track menu's "Export MusicXML" action.

| Option              | Default      | Description                                                    |
| ------------------- | ------------ | -------------------------------------------------------------- |
| `--width`           | `1280`       | Frame width. The score scales to fill it.                      |
| `--height`          | `480`        | Frame height. The default fits two systems of a typical score. |
| `--fps`             | `30`         | Frame rate.                                                    |
| `--start` / `--end` | whole score  | Time range in seconds, for quick iteration.                    |
| `--workers`         | `4`          | Browser pages capturing frames in parallel.                    |
| `--url`             | deployed app | Toy MIDI app to render with, such as a local dev server.       |

Width and height must be even for H.264 output.

### Output

The output is a silent H.264 MP4 at a constant frame rate. The video starts at the score's first measure and ends at the end of its final measure, without any lead-in or tail, so a video editor can hold the first and last frames and align the layer against the audio.

Rendering is faster than real time with the default settings. For example, a 2:19 score renders at 1280x480 in about a minute on a desktop machine, and larger frames take proportionally longer.

## `render-audio`

`render-audio` renders a project's mix to a WAV without opening the editor. It produces the same file as the editor's "Export Audio" action: stereo, 48 kHz, 16-bit PCM, with every audio and MIDI track at its mixer settings.

### Usage

```sh
toy-midi render-audio song.toymidi.zip song.wav
toy-midi render-audio song.json song.wav
toy-midi render-audio 'https://toy-midi.hiro18181.workers.dev/draft#p=<payload>' song.wav
toy-midi render-audio 'https://toy-midi.hiro18181.workers.dev/draft?src=https://example.com/song.json' song.wav
```

The input is one of:

- A project archive, exported from the editor menu's "Export Project" action.
- A `.json` file in the `SharedProject` format that share links carry.
- A share link, either `/draft#p=<payload>` from the editor menu's "Copy Share Link" action or `/draft?src=<url>`, which renders the project at its `src` URL.

Archives and `.json` files can be paths or URLs. A `SharedProject` has no audio tracks, so its mix holds only MIDI.

| Option  | Default      | Description                                              |
| ------- | ------------ | -------------------------------------------------------- |
| `--url` | deployed app | Toy MIDI app to render with, such as a local dev server. |

## `export-midi`

`export-midi` writes a project's MIDI tracks to a Standard MIDI File without opening the editor. It produces the same file as the editor menu's "Export MIDI" action: one track per MIDI track with its name, program, gain, pan, and automation, and the project's tempo, time signature, and locators as markers.

A MIDI file addresses a preset only by bank and program, so it doesn't say which SoundFont a track uses. Read each track's `soundfont` from the project to play it as the app does.

### Usage

```sh
toy-midi export-midi song.json song.mid
```

The input is any project that `render-audio` takes. Audio tracks are left out.

| Option  | Default      | Description                                              |
| ------- | ------------ | -------------------------------------------------------- |
| `--url` | deployed app | Toy MIDI app to export with, such as a local dev server. |

## Development

Run the CLI from the repository against a local dev server:

```sh
pnpm dev --port 5173
pnpm toy-midi score-video score.musicxml score.mp4 --url http://localhost:5173
```
