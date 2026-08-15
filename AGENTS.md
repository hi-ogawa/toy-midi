# Agent Guide

## Quick Reference

| Command         | When                                      |
| --------------- | ----------------------------------------- |
| `pnpm lint`     | Format, Lint, Typecheck after any changes |
| `pnpm test`     | Unit tests (src/, vitest)                 |
| `pnpm test-e2e` | E2E tests (e2e/, playwright)              |

## Key Docs

| File                       | Purpose                            |
| -------------------------- | ---------------------------------- |
| `docs/architecture.md`     | Technical architecture overview    |
| `docs/references.md`       | Reference projects and libraries   |
| `docs/rust-development.md` | Rust and WASM development workflow |

Planned work and known bugs live in GitHub issues, minor code-level nits as inline `TODO` comments. Update `docs/architecture.md` only when architectural ownership, data flow, persistence contracts, or other durable design decisions change, and file follow-ups as issues.

## Conventions

- This application is desktop-only. Do not propose, evaluate, implement, or mention mobile or responsive behavior
- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`); add `!` for breaking changes
- File names: kebab-case
- Prefer the smallest correct change, and avoid speculative abstractions or compatibility paths
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- Before adding or increasing an E2E timeout, instrument the focused test with `createCheckpoint()` from `e2e/helpers.ts` and run it repeatedly (for example, `pnpm test-e2e e2e/example.spec.ts --repeat-each=10`). Prefer Playwright's existing auto-waiting when measurements fit comfortably within its timeout; derive any custom timeout from the observed range with reasonable headroom.
- Keep cohesive implementation together, and split files only for reuse or a clear module boundary
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Prefer a single options object over multiple primitive arguments (for example, `fn({ a, b })` rather than `fn(a, b)`)
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
