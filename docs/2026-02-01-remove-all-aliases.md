# Remove all path aliases + keep shadcn generation working

Problem context and approach

- Goal: remove any path aliases (TS/Vite) and still make shadcn component generation usable.
- Constraint: shadcn CLI does not emit relative imports; it uses `components.json` aliases as module specifiers.
- Approach: keep `components.json` aliases as project-root specifiers (e.g., `src/lib/utils`), remove TS/Vite aliases, and add a small post-process script to rewrite generated imports to relative paths for the new files.

Reference files/patterns to follow

- components.json aliases are used by shadcn CLI for install paths and imports.
- src/components/ui/\* for shadcn components.
- package.json scripts for tooling helpers.

Implementation steps

1. Ensure TS/Vite alias configs are removed (no `paths`, no Vite alias).
2. Add a script (Node/TS) that rewrites import specifiers like `src/...` into relative paths based on file location.
3. Add a wrapper script, e.g. `pnpm shadcn:add <component>` that runs shadcn CLI then runs the rewrite script on newly created/updated files.
4. Document the new workflow in README (or docs) so shadcn usage stays consistent.
5. Verify by generating `badge` and confirming imports are relative.

Feedback log

- (none yet)

Status

- What's done: added shadcn wrapper + import rewrite script, updated README, verified badge generation.
- What's remaining: none.
- Blockers/open questions: none.
