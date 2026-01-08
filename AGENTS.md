# Agent Guide

## Quick Reference

| Command                 | When                         |
| ----------------------- | ---------------------------- |
| `pnpm dev`              | Start dev server             |
| `pnpm tsc && pnpm lint` | After changes                |
| `pnpm test`             | Unit tests (src/, vitest)    |
| `pnpm test-e2e`         | E2E tests (e2e/, playwright) |
| `pnpm build`            | Before commit                |

## Key Docs

| File                   | Purpose                              |
| ---------------------- | ------------------------------------ |
| `docs/prd.md`          | Requirements, UX specs, architecture |
| `docs/decisions.md`    | Technical decisions log              |
| `docs/TODO.md`         | Open items (remove when done)        |
| `docs/YYYY-MM-DD-*.md` | Task-specific planning/notes         |

Read `docs/prd.md` before implementing features.

## Task Documents

For non-trivial work, create `docs/YYYY-MM-DD-<topic>.md` **before implementing**:

- Problem context and approach
- Reference files/patterns to follow
- Implementation steps
- Feedback log (append user feedback during iteration)

**Workflow:**

1. Create task doc with plan
2. Wait for user feedback
3. Log feedback to task doc, iterate on plan
4. Proceed with implementation after approval

This enables review before work begins. Commit task docs with the work.

## Conventions

- File names: kebab-case
- Minimize file splits (multiple components per file when related)
- SVG for piano roll rendering
- Tone.js for audio/MIDI

## Reference Code

Local references in `refs/` (gitignored). Key ones:

| Ref          | Path               | What to look at               |
| ------------ | ------------------ | ----------------------------- |
| Signal       | `refs/signal`      | Piano roll UI, React patterns |
| Tone.js      | `refs/tone-js`     | Audio API usage               |
| @tonejs/midi | `refs/tonejs-midi` | MIDI file generation          |

## Testing Strategy

**Priority**: Editor input/interaction testing is essential.

| Area                    | Priority | Approach                                |
| ----------------------- | -------- | --------------------------------------- |
| Piano roll interactions | High     | E2E tests (click, drag, select, delete) |
| Note state management   | High     | Unit tests for store                    |
| MIDI export             | Medium   | Unit tests for output format            |
| Audio playback          | Low      | Manual testing for now                  |

**Note**: Web Audio integration is hard to test automatically. Focus tests on:

- SVG rendering and interaction
- Mouse event handling (create, move, resize notes)
- Keyboard events (delete, shortcuts)
- State correctness after interactions

Audio sync can be tested manually during development.

## Git Workflow

1. Create feature branch before starting work
2. Commit logical changes separately
3. Confirm with user before committing
