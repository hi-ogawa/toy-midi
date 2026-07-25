# Agent Guide

## Quick Reference

| Command         | When                                      |
| --------------- | ----------------------------------------- |
| `pnpm lint`     | Format, Lint, Typecheck after any changes |
| `pnpm test`     | Unit tests (src/, vitest)                 |
| `pnpm test-e2e` | E2E tests (e2e/, playwright)              |

## Conventions

- File names: kebab-case
- Minimize file splits (multiple components per file when related)

## Testing Strategy

**Priority**: Editor input/interaction testing is essential.

**E2E-first approach**: For UI features, write E2E test skeletons (`test.skip`) before implementation. This:

- Clarifies expected behavior upfront
- Defines testable acceptance criteria
- Ensures test coverage isn't forgotten

| Area                    | Priority | Approach                                |
| ----------------------- | -------- | --------------------------------------- |
| Piano roll interactions | High     | E2E tests (click, drag, select, delete) |
| Note state management   | High     | Unit tests for store                    |
| MIDI export             | Medium   | Unit tests for output format            |
| Audio playback          | Low      | Manual testing for now                  |

**E2E iteration tips**: Use `--timeout` and `-x` to fail fast when iterating:

```bash
pnpm test-e2e --timeout 5000 -x  # 5s timeout, stop on first failure
```

**Note**: (TODO: reconsider audio testing ⚠️)

Web Audio integration is hard to test automatically. Focus tests on:

- SVG rendering and interaction
- Mouse event handling (create, move, resize notes)
- Keyboard events (delete, shortcuts)
- State correctness after interactions

Audio sync can be tested manually during development.
