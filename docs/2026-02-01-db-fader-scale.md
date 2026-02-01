# dB Fader Scale (-60dB to +6dB)

## Problem context and approach

Current faders use a linear 0–1 gain value with a placeholder 0 dB marker. The desired behavior is a true decibel fader range (e.g., -60 dB to +6 dB), with the visual marker placed at 0 dB (unity gain). This requires mapping slider percent to dB and to linear gain for Tone.js/state, and updating UI to reflect the proper 0 dB position.

Approach:

- Define a shared mapping between slider percent (0–100) and dB range (-60 to +6), plus conversion to linear gain.
- Update fader controls (left track strip and mixer) to use the dB mapping.
- Place the 0 dB marker at the correct percent position.
- Ensure existing state values persist correctly (migrate if needed or map on render).

## Reference files/patterns to follow

- `src/components/piano-roll.tsx` (left track controls)
- `src/components/mixer.tsx` (mixer faders)
- `src/lib/audio.ts` (gain application)
- `src/stores/project-store.ts` (volume state)

## Implementation steps

1. Add dB conversion helpers (percent↔dB, dB↔gain) in a shared utility (likely `src/lib/music.ts` or `src/lib/utils.ts`).
2. Update fader components to use dB percent mapping while preserving stored gain state.
3. Place 0 dB marker based on the mapping (0 dB percent).
4. Verify muted behavior remains unchanged and no regressions in E2E tests.
5. Update docs/status and run `pnpm test-e2e` after implementation.

## Feedback log

- 2026-02-01: Request to implement -60 dB to +6 dB fader scale and correct 0 dB marker.

## Status

- What's done: task doc created.
- What's remaining: implement dB fader mapping, update UI markers, test.
- Blockers or open questions: confirm if stored volume should remain linear gain or migrate to dB values.
