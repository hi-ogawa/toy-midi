# Icon Deduplication (Metronome + Similar)

## Problem Context and Approach

MetronomeIcon is defined in multiple components (e.g. transport and mixer). The goal is to consolidate duplicate icon components into a shared location and update call sites. I will also scan for other duplicated inline icon components and fold them into the shared location if they are identical or near-identical.

Approach: identify all inline icon components, group duplicates by SVG structure, and move shared ones into a single file (likely a new `src/components/icons.tsx` or existing common UI file). Replace local definitions with imports to keep behavior consistent.

## Reference Files / Patterns

- `src/components/transport.tsx` (MetronomeIcon definition)
- `src/components/mixer.tsx` (MetronomeIcon definition)
- Existing shared UI component patterns in `src/components` (to follow project conventions)

## Implementation Steps

1. Create a feature branch for this refactor.
2. Inventory inline icon components across `src/components/**`.
3. Compare for duplicates (exact SVG and props).
4. Create or update a shared icons module and move duplicates there.
5. Replace inline definitions with imports.
6. Ensure no behavior changes and run type check if needed.

## Feedback Log

- 2026-02-01: Initial request to dedupe MetronomeIcon and search for similar duplicacy.

## Status

- Done: Created feature branch; scanned for duplicate icons; centralized MetronomeIcon in shared module; updated imports.
- Remaining: None.
- Blockers / Open Questions: None.
