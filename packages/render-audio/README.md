# Render Audio CLI

`toy-midi-render-audio` renders a Toy MIDI project archive to a WAV file from the command line. It runs the real app's Export Audio in headless Chromium, so the file is the same one the app exports.

Export Audio renders audio tracks only for now, so MIDI tracks are left out of the render, and the CLI warns when a project has any.

## Install

The CLI installs directly from GitHub without cloning the repository.

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/render-audio"
```

It also needs a Playwright Chromium build. When it is missing, the CLI prints the exact install command, which has the form `npx playwright-core@<version> install chromium --no-shell`.

## Usage

```sh
toy-midi-render-audio song.toymidi.zip song.wav
```

Export the archive with the editor menu's "Export Project" action. The output is the same format as Export Audio, which is a stereo, 48 kHz, 16-bit PCM WAV.

| Option  | Default      | Description                                              |
| ------- | ------------ | -------------------------------------------------------- |
| `--url` | deployed app | Toy MIDI app to render with, such as a local dev server. |

By default, the CLI renders against the deployed app at https://toy-midi.hiro18181.workers.dev.

## How It Works

The CLI opens `/render-capture`, a bare page that exposes a render function as `window.__toyMidiRenderCapture`. The CLI passes the archive to it, and the page imports the archive the way the project list does, loads it into an editor runtime, and renders and encodes the mix with the same calls as Export Audio. The page returns the WAV, and the CLI writes it to the output path.

## Development

Run the CLI from the repository against a local dev server:

```sh
pnpm dev --port 5173
pnpm render-audio song.toymidi.zip song.wav --url http://localhost:5173
```

The test in `e2e/render-audio-output.spec.ts` exports a project's audio and archive from the app, renders the archive through the CLI, and checks that both WAV files are identical.
