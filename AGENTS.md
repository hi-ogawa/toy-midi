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
- Function names: start with a verb for the action the function performs, so a call site reads as what happens rather than what comes back. Components, hooks, and other constructs with their own ecosystem naming conventions follow those instead
- Do not add compatibility paths or handling for edge cases that do not occur in practice
- Organize code so each chunk can be validated by one body of expertise. A reader meets files and diffs linearly and loads one such body at a time. Ask which single specialist could review a chunk alone, split where the needed expertise changes even with one caller, and keep code together when it shares one domain regardless of length
- When an existing test fails, first verify from first principles whether its expectation is correct. Do not compensate in the implementation merely to preserve an incorrect test.
- E2E tests run against a fresh production build by default. Use `E2E_SERVER=dev` to run against the dev server.
- `pnpm test-e2e <test-file>` records DOM traces by default locally and generates `test-results/trace-pack.html`. Use `E2E_TRACE=0` to disable tracing. CI leaves tracing off by default. `pnpm test-e2e-trace <test-file>` or `E2E_TRACE=1` explicitly enables tracing. For selected branch traces on GitHub Actions with artifact links, see [E2E traces on GitHub Actions](docs/e2e.md).
- Add short narrative comments before each logical phase of an E2E test, describing the user action and expected behavior so the comments alone convey the scenario. Use direct, verb-led wording for actions, such as “Load a backing track.”
- Before adding or increasing an E2E timeout, measure the relevant wait with `createCheckpoint()` from `e2e/helpers.ts`. Prefer Playwright's default timeout when it comfortably covers the measured duration. If a custom timeout is needed, allow reasonable headroom and document the measured duration beside it.
- Order functions by reading flow, with primary entry points and callers before their implementation helpers
- Comment only what the code cannot say, such as a non-obvious reason or a constraint the types do not show. Do not restate a name or type, do not describe other files, and state a rationale once, where it is enforced. Write comments without the awkward or defensive tone that builds up when code is revised
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them
- Shape arguments the way a reader expects from the operation. Take a value positionally when the operation conventionally takes just that value. Use an options object when a call site would be ambiguous without names
- Use braces for every `switch` case body (`case "x": { ... }`, `default: { ... }`)
- Docs: follow the writing conventions in [docs/AGENTS.md](docs/AGENTS.md)
