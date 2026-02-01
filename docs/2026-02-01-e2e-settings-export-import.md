# E2E settings export/import .toymidi flow

## Problem context and approach

Need stronger E2E coverage for unified import/export flow: exporting a .toymidi project and importing it back. This should validate the ZIP export, re-import path, and restored state (notes/audio metadata).

Approach:

- Add/expand `e2e/settings-export.spec.ts` to drive export from settings and import from startup screen.
- Use Playwright download handling to save the .toymidi file, then reload the app and import the downloaded file.
- Validate state restoration via UI + `evaluateStore` (notes/tempo/time signature) and project list name.

## Reference files/patterns to follow

- Existing export/import UI in `src/components/settings.tsx` and `src/app.tsx` startup screen import.
- E2E helpers in `e2e/helpers.ts` (startup, audio load, evaluate store).
- Project file logic in `src/lib/project-file.ts`.

## Implementation steps

1. Inspect `e2e/settings-export.spec.ts` for current coverage and patterns.
2. Add a test that:
   - creates a new project, sets tempo/time signature, adds notes (via `evaluateStore`),
   - exports .toymidi from settings (download),
   - reloads to startup screen and imports the downloaded file,
   - asserts new project name and restored notes/tempo/time signature.
3. Ensure test cleans storage before starting.
4. Run `pnpm test-e2e -- --project=chromium e2e/settings-export.spec.ts`.

## Feedback log

- 2026-02-01: user requested improved E2E coverage for export + import .toymidi flow.

## Status

- What's done: added export/import .toymidi E2E coverage with notes + tempo/time signature assertions; spec passes locally.
- What's remaining: none.
- Blockers/open questions: none.
