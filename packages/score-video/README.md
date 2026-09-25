# Score Video CLI

`toy-midi-score-video` renders a MusicXML score into a silent scrolling score video, for use as a score layer in a video editor. It drives the real Toy MIDI score viewer frame by frame and screenshots it, so the cursor, scrolling, and score settings match interactive playback.

## Install

The CLI installs directly from GitHub without cloning the repository.

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/score-video"
```

It also needs:

- `ffmpeg` on `PATH` for encoding.
- A Playwright Chromium build. When it is missing, the CLI prints the exact install command, which has the form `npx playwright-core@<version> install chromium --no-shell`.

## Usage

```sh
toy-midi-score-video score.musicxml score.mp4
```

Export the MusicXML from a recorder MIDI track with the track menu's "Export MusicXML" action. By default, the CLI renders against the deployed app at https://toy-midi.hiro18181.workers.dev.

| Option              | Default      | Description                                                    |
| ------------------- | ------------ | -------------------------------------------------------------- |
| `--width`           | `1280`       | Frame width. The score scales to fill it.                      |
| `--height`          | `480`        | Frame height. The default fits two systems of a typical score. |
| `--fps`             | `30`         | Frame rate.                                                    |
| `--start` / `--end` | whole score  | Time range in seconds, for quick iteration.                    |
| `--workers`         | `4`          | Browser pages capturing frames in parallel.                    |
| `--url`             | deployed app | Toy MIDI app to render with, such as a local dev server.       |

Width and height must be even for H.264 output.

## Output

The output is a silent H.264 MP4 at a constant frame rate. The video starts at the score's first measure and ends at the end of its final measure, without any lead-in or tail, so a video editor can hold the first and last frames and align the layer against the audio.

Rendering is faster than real time with the default settings. For example, a 2:19 score renders at 1280x480 in about a minute on a desktop machine, and larger frames take proportionally longer.

## How It Works

The CLI opens `/score-viewer` with the score injected as `window.__toyMidiScoreViewerCaptureSource`, which puts the viewer in capture mode. Capture mode reduces the viewer to its score area and exposes the viewer runtime as `window.__toyMidiScoreViewer`, which the CLI uses to fit the score to the frame width, read its duration, and seek the playhead. For each frame, the CLI seeks the viewer to the frame time and captures a screenshot, then pipes the frames to `ffmpeg`.

Several pages capture interleaved frames in parallel. Each page still steps forward through the score, so the viewer's scroll position, which depends on which systems the cursor has passed, matches a sequential render. A time range render replays earlier seeks without capturing for the same reason.

## Development

Run the CLI from the repository against a local dev server:

```sh
pnpm dev --port 5173
pnpm render-score-video score.musicxml score.mp4 --url http://localhost:5173
```

The `capture score video` test in `e2e/score-viewer-output.spec.ts` renders a short clip through the CLI and leaves it at `.tmp/score-viewer-output-video.mp4` for inspection.
