# Project Scaffold

Phase 1 setup: Vite + React + TypeScript with testing infrastructure.

## Reference

Following conventions from `anki-tools`:

- Vite + React 19 + TypeScript
- Tailwind CSS v4 with `@tailwindcss/vite` plugin
- oxfmt for formatting (no ESLint)
- Playwright for E2E tests
- shadcn/ui for components

## Tooling

| Tool           | Notes                       |
| -------------- | --------------------------- |
| Vite           | Build tool                  |
| React 19       | UI framework                |
| TypeScript     | Strict mode                 |
| Tailwind CSS 4 | @tailwindcss/vite plugin    |
| oxfmt          | Formatting only, no linting |
| Playwright     | E2E testing                 |
| Vitest         | Unit testing                |
| Zustand        | State management            |
| shadcn/ui      | Component library           |

## Config Files to Create

From anki-tools reference:

| File                       | Source                           |
| -------------------------- | -------------------------------- |
| `package.json`             | Adapted for toy-midi             |
| `vite.config.ts`           | Same pattern, simpler (no proxy) |
| `tsconfig.json`            | Same                             |
| `.oxfmtrc.jsonc`           | Same                             |
| `.gitignore`               | Adapted                          |
| `components.json`          | shadcn config                    |
| `playwright.config.ts`     | Simpler (no fixture server)      |
| `.github/workflows/ci.yml` | Simpler (no uv/Python)           |

## Scripts

```json
{
  "dev": "vite dev",
  "build": "vite build",
  "tsc": "tsc -b",
  "lint": "oxfmt",
  "lint-check": "oxfmt --check",
  "test": "vitest",
  "test-e2e": "playwright test"
}
```

## Directory Structure

```
src/
├── app.tsx                  # Root component
├── main.tsx                 # Entry point
├── index.css                # Global styles (Tailwind)
├── components/
│   └── ui/                  # shadcn components
├── stores/
│   └── project-store.ts     # Zustand store
├── lib/
│   ├── utils.ts             # cn() utility
│   └── music.ts             # Note/pitch utilities
└── types.ts                 # Shared types
```

## Implementation Steps

1. Update package.json (remove ESLint deps, add oxfmt)
2. Create vite.config.ts
3. Create tsconfig.json
4. Create .oxfmtrc.jsonc
5. Update .gitignore
6. Create components.json (shadcn)
7. Create playwright.config.ts
8. Create vitest.config.ts
9. Create src/ structure with placeholder app
10. Create .github/workflows/ci.yml
11. Install and verify: `pnpm install && pnpm update --latest && pnpm dev && pnpm tsc && pnpm build`

## Feedback Log

- No ESLint, use oxfmt only
- Reference anki-tools config files: .github, .gitignore, .oxfmtrc.jsonc, shadcn, tsconfig
- Simplified scripts (removed test-watch)
- Use latest package versions: `pnpm update --latest` after install
- Move tests/e2e to top-level e2e/
- Unit tests colocated in src/ (pure unit tests, no jsdom)
- `pnpm test` - unit tests in src/ (vitest)
- `pnpm test-e2e` - E2E tests in e2e/ (playwright)

## Future

- Consider `simple-git-hooks` for pre-commit lint: `pnpm add -D simple-git-hooks` + add `"simple-git-hooks": {"pre-commit": "pnpm lint-check"}` to package.json
