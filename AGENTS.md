# Agent Guide

## Quick Reference

| Command                   | When                         |
| ------------------------- | ---------------------------- |
| `pnpm dev`                | Start dev server             |
| `pnpm tsc && pnpm lint`   | After changes                |
| `pnpm test`               | Unit tests (src/, vitest)    |
| `pnpm test-e2e`           | E2E tests (e2e/, playwright) |
| `pnpm lint && pnpm build` | **Before commit**            |

## Key Docs

| File                   | Purpose                           |
| ---------------------- | --------------------------------- |
| `docs/TODO.md`         | **Short-term tasks (start here)** |
| `docs/prd.md`          | Requirements, UX specs, features  |
| `docs/architecture.md` | Technical architecture overview   |
| `docs/references.md`   | Reference projects and libraries  |
| `docs/YYYY-MM-DD-*.md` | Task-specific planning/notes      |

Read `docs/prd.md` before implementing features.

## Task Documents

For non-trivial work, create `docs/YYYY-MM-DD-<topic>.md` **before implementing**.

Task docs should enable **handoff to a fresh agent** - include enough context to continue without conversation history.

**Structure:**

- Problem context and approach
- Reference files/patterns to follow
- Implementation steps
- Feedback log (append user feedback during iteration)
- **Status** (update before session ends):
  - What's done
  - What's remaining
  - Any blockers or open questions

**Workflow:**

1. Create task doc with plan
2. Wait for user feedback
3. Log feedback to task doc, iterate on plan
4. Proceed with implementation after approval
5. **Update status before ending session**

To continue in fresh session: `Read docs/YYYY-MM-DD-<topic>.md and continue`

## Conventions

- File names: kebab-case
- Minimize file splits (multiple components per file when related)
- SVG for piano roll rendering
- Tone.js for audio/MIDI

## Reference Code

See `docs/references.md` for full list of reference projects and libraries.

Local references in `refs/` (gitignored). Key ones:

| Ref     | Path           | What to look at                              |
| ------- | -------------- | -------------------------------------------- |
| Signal  | `refs/signal`  | Piano roll UI, React patterns                |
| Tone.js | `refs/Tone.js` | Audio API, Transport, synths (see examples/) |

Setup: `pnpm dlx tiged https://github.com/Tonejs/Tone.js.git refs/Tone.js`

## Testing Strategy

**Priority**: Editor input/interaction testing is essential.

| Area                    | Priority | Approach                                |
| ----------------------- | -------- | --------------------------------------- |
| Piano roll interactions | High     | E2E tests (click, drag, select, delete) |
| Note state management   | High     | Unit tests for store                    |
| MIDI export             | Medium   | Unit tests for output format            |
| Audio playback          | Low      | Manual testing for now                  |

**Note**: (TODO: reconsider audio testing ⚠️)

Web Audio integration is hard to test automatically. Focus tests on:

- SVG rendering and interaction
- Mouse event handling (create, move, resize notes)
- Keyboard events (delete, shortcuts)
- State correctness after interactions

Audio sync can be tested manually during development.

## Agent Rules

- **Never run long-running tasks** (dev servers, watch modes, etc.)
- Use `pnpm build` to verify code, not `pnpm dev`
- User runs `pnpm dev` manually in their terminal

## Git Workflow

1. Create feature branch before starting work
2. Commit logical changes separately
3. **Run `pnpm lint` before every commit** (formats .ts, .tsx, .md, .json, etc.)
4. Confirm with user before committing
