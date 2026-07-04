# Remove ABC Export

## Problem Context And Approach

ABC export is no longer considered useful enough to keep in the product. Remove it from the user-facing settings export section and delete the dedicated implementation and tests so MIDI export and `.toymidi` project export remain the supported export paths.

This is a removal, not a replacement. Avoid adding compatibility shims because ABC files are only generated on demand and are not part of persisted project data.

## Reference Files And Patterns

- `src/components/settings.tsx` contains export UI and handlers.
- `src/lib/midi-export.ts` remains the supported note export implementation.
- `src/lib/project-file.ts` remains the supported project export implementation.
- `e2e/transport.spec.ts` contains existing export workflow tests.
- `docs/prd.md` tracks feature status.

## Implementation Steps

1. Remove ABC imports, handlers, and buttons from `src/components/settings.tsx`.
2. Delete `src/lib/abc-export.ts` and `src/lib/abc-export.test.ts`.
3. Remove ABC-specific E2E workflows from `e2e/transport.spec.ts`.
4. Update `docs/prd.md` so it no longer lists ABC export as an active completed feature.
5. Run static verification only: `pnpm lint-check`.
