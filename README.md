# toy-midi

A web-based MIDI piano roll for simple transcription workflow.

![Demo](docs/assets/demo.png)

A general-purpose DAW is overkill for transcription-only work, so this is a focused piano roll optimized for mouse-based note entry alongside a backing track:

- Load a backing track audio file (WAV, MP3, etc.)
- Play with the metronome to adjust tempo and audio offset
- Mark song sections with locators
- Click the piano roll to place notes while listening
- Play to verify, repeat until done
- Export MIDI, import into a DAW for final polish

Click the **?** button in the transport bar for all keyboard shortcuts and mouse actions (source of truth: `src/lib/keybindings.ts`).

## Development

```bash
pnpm install
pnpm dev
```

## Docs

- [docs/architecture.md](docs/architecture.md)
