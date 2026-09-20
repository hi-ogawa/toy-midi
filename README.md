# toy-midi

A browser-based tool for practicing with backing tracks, recording an instrument, and transcribing music into MIDI.

![Toy MIDI project editor](docs/assets/demo.png)

## Features

- Arrange backing audio and record takes with loop and punch recording.
- Edit MIDI notes in a piano roll, convert audio to MIDI, and preview notation and tablature.
- Practice with variable playback speed, a metronome, locators, and synchronized YouTube reference video.
- Mix tracks and export audio as WAV.
- Save projects in your browser and import or export portable project archives.

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm build       # Production build
pnpm lint        # Format, lint, and typecheck
pnpm test        # Unit tests
pnpm test-e2e    # E2E tests against a fresh production build
```

Application development uses a prebuilt pitch-detection WASM package. See [Rust development](docs/rust-development.md) for working on the Rust implementation. The lint command also runs `cargo fmt`, which requires a Rust toolchain.
