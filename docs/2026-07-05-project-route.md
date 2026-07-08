# Project route: `/project/:id` deep link

Part of #152, scoped down. Product goal: each project gets a real URL —
bookmarkable, reload lands back in the same project, e2e can `goto` directly.

Deliberately NOT in scope (decided in discussion):

- No client-side navigation, router, or `popstate` handling. Navigation
  between projects is full page load; process death is the cleanup.
- `/` startup screen logic is unchanged (no `replaceState` when opening a
  project from the list; Settings "Projects" button stays `window.open`).
- No `dispose()` callers, no projectName-into-store change (#152 step 3).

## Design

Route fork at the top of `App` (`src/app.tsx`): parse `location.pathname`
once. `/project/:id` renders a new `ProjectRoute`; everything else renders
the existing startup flow verbatim.

`ProjectRoute` loads via `useQuery` (deduped under StrictMode, unlike a
mutate-on-mount): `audioManager.init()` + `openProjectSession({ projectId })`
from #153. Unknown/deleted id → the error is rendered in place (no
redirect, no toast).

### Audio unlock

Browser autoplay policy only blocks `AudioContext.resume()` — i.e.
`Tone.start()` in `audioManager.init()` (`src/lib/audio.ts`). Everything
else (WASM worklet, soundfont fetch, `decodeAudioData`) works on a
suspended context, which simply produces silence.

So: remove `Tone.start()` from `init()`; register one-shot capture-phase
`pointerdown`/`keydown` listeners in `main()` that call `Tone.start()`
(`unlockAudioOnFirstGesture` in `src/lib/audio.ts`). Deep links init
eagerly with no gate; the user's first interaction anywhere unlocks audio.
Capture phase means "click play as the very first interaction" resumes the
context within the same gesture. The `/` flow is unaffected: the
project-card click fires the unlock listener before the init mutation.

### Hosting

Vite dev server already serves index.html for unknown paths (SPA default),
so dev and Playwright need nothing. Production needs
`"not_found_handling": "single-page-application"` in `wrangler.jsonc`.

## Files

- `src/app.tsx` — route fork + `ProjectRoute`
- `src/lib/audio.ts` — drop `Tone.start()` from `init()`, add
  `unlockAudioOnFirstGesture()`
- `src/main.tsx` — register unlock listeners
- `wrangler.jsonc` — SPA fallback
- `e2e/project-route.spec.ts` — deep link opens project; bogus id
  shows an error message

## Status

- Implemented in worktree `toy-midi-project-route` (branch `project-route`)
- Static verify only so far (`pnpm lint`); e2e not yet run
