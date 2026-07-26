# Agent Guide

## Quick Reference

| Command         | When                                      |
| --------------- | ----------------------------------------- |
| `pnpm lint`     | Format, Lint, Typecheck after any changes |
| `pnpm test`     | Unit tests (src/, vitest)                 |
| `pnpm test-e2e` | E2E tests (e2e/, playwright)              |

## Key Docs

| File                   | Purpose                          |
| ---------------------- | -------------------------------- |
| `docs/architecture.md` | Technical architecture overview  |
| `docs/references.md`   | Reference projects and libraries |

Planned work and known bugs live in GitHub issues, minor code-level nits as inline `TODO` comments. Update `docs/architecture.md` only when architectural ownership, data flow, persistence contracts, or other durable design decisions change, and file follow-ups as issues.

## Conventions

- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`); add `!` for breaking changes
- File names: kebab-case
- Prefer the smallest correct change, and avoid speculative abstractions or compatibility paths
- Keep cohesive implementation together, and split files only for reuse or a clear module boundary
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Prefer a single options object over multiple primitive arguments (for example, `fn({ a, b })` rather than `fn(a, b)`)
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)

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
