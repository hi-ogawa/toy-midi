# Track Active Indicator (Main View)

## Problem context and approach

The main editor view does not show whether the audio or MIDI tracks are muted. Users can toggle mute via shortcuts or the mixer dialog, but there is no immediate visual status in the main view. The plan is to add a left-side track control strip with faders and mute buttons.

Approach:

- Use `midiMuted` / `audioMuted` and volume state from `useProjectStore()` in `src/components/piano-roll.tsx`.
- Add a left-side track control column with faders and mute buttons for Audio and MIDI.
- Keep controls aligned with the waveform and keyboard regions.

## Reference files/patterns to follow

- `src/components/piano-roll.tsx` (main view layout)
- `src/components/mixer.tsx` (fader + mute styling)
- `src/stores/project-store.ts` (mute state)

## Implementation steps

1. Add a left track control column with Audio and MIDI faders + mute buttons.
2. Align controls with waveform and keyboard regions and include a divider.
3. Remove header-only toggle approach.

## Process

1. create PR if implementation is done.
2. run test-e2e
3. if failed, iterate until it passes

## Feedback log

- 2026-02-01: Add process: create PR after implementation, run `pnpm test-e2e`, iterate until it passes.
- 2026-02-01: Move to left-side track control strip with faders + mute buttons.
- [x] redesign control

```
Audio                         |
[<-fader->] [M]               |     audio wave form
-----------------|------------|-------------
MIDI             |            |
[<-fader->] [M]  |  piano     |
                 |  roll      |      midi notes
                 |
```

- [ ] don't disable fader when muted

## Status

- What's done: left track control strip implemented; PR created; `pnpm test-e2e` passing.
- What's remaining: none.
- Blockers or open questions: none.
