# Agent Guide

## Quick Reference

| Command         | When                                      |
| --------------- | ----------------------------------------- |
| `pnpm lint`     | Format, Lint, Typecheck after any changes |
| `pnpm test`     | Unit tests (src/, vitest)                 |
| `pnpm test-e2e` | E2E tests (e2e/, playwright)              |

## Conventions

- This application is desktop-only. Do not propose, evaluate, implement, or mention mobile or responsive behavior
- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`); add `!` for breaking changes
- File names: kebab-case
- Prefer the smallest correct change, and avoid speculative abstractions or compatibility paths
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- Before adding or increasing an E2E timeout, measure the relevant wait with `createCheckpoint()` from `e2e/helpers.ts`. Prefer Playwright's default timeout when it comfortably covers the measured duration. If a custom timeout is needed, allow reasonable headroom and document the measured duration beside it.
- Organize code into chunks with one primary reasoning domain, but do not equate a reasoning boundary with code or file extraction. Keep cohesive chunks together unless they form a clear module boundary
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Prefer a single options object over multiple primitive arguments (for example, `fn({ a, b })` rather than `fn(a: number, b: number)`)
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
