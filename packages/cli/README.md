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

### How It Works

The CLI opens `/score-capture`, a bare page that renders only the score viewer runtime and exposes it as `window.__toyMidiCli.scoreViewer`. The CLI uses the runtime to load the score, fit it to the frame width, read its duration, and seek the playhead. For each frame, the CLI seeks the viewer to the frame time and captures a screenshot, then pipes the frames to `ffmpeg`.

Several pages capture interleaved frames in parallel. Each page still steps forward through the score, so the viewer's scroll position, which depends on which systems the cursor has passed, matches a sequential render. A time range render replays earlier seeks without capturing for the same reason.

## `render-audio`

`render-audio` renders a project archive's mix to a WAV without opening the editor. It produces the same file as the editor's "Export Audio" action: stereo, 48 kHz, 16-bit PCM, with every audio and MIDI track at its mixer settings.

### Usage

```sh
toy-midi render-audio song.toymidi.zip song.wav
```

Export the archive from the editor menu's "Export Project" action.

| Option  | Default      | Description                                              |
| ------- | ------------ | -------------------------------------------------------- |
| `--url` | deployed app | Toy MIDI app to render with, such as a local dev server. |

### How It Works

The CLI opens `/editor-runtime`, a bare page that exposes an editor runtime as `window.__toyMidiCli.editor`, the same runtime the editor drives. The page fetches the archive from a URL that the CLI intercepts and serves from the input file, loads it into the runtime, renders the mix through the runtime's Export Audio path, and triggers a download that the CLI saves to the output path. MIDI tracks load their SoundFonts from the app, so the CLI needs no local copy of them.

## Development

Run the CLI from the repository against a local dev server:

```sh
pnpm dev --port 5173
pnpm toy-midi score-video score.musicxml score.mp4 --url http://localhost:5173
```

The `capture score video` test in `e2e/score-viewer-output.spec.ts` renders a short clip through the CLI and leaves it at `.tmp/score-viewer-output-video.mp4` for inspection. The `renders a project archive through the CLI` test in `e2e/mix.spec.ts` covers `render-audio`.
