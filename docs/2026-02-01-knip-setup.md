# Knip setup (unused exports)

Problem context and approach

- Goal: add Knip to detect unused exports in this repo.
- Approach: install Knip, add a minimal config tuned for Vite + TS, wire a script, and document how to run it.

Reference files/patterns to follow

- package.json scripts: add a `knip` script near other tooling scripts.
- tsconfig.json: use for TS project references if needed by Knip.

Implementation steps

1. Add `knip` as a dev dependency.
2. Add `knip` script in package.json (e.g. `knip` or `knip:check`).
3. Create `knip.json` (or `knip.config.ts`) with:
   - entry points: Vite app entry `index.html`
   - project files: `src/**/*.{ts,tsx}`
   - ignore patterns for build output and tests as needed
4. (Optional) Add CI-friendly guidance in README.

Feedback log

- (none yet)

Status

- What's done: added knip dependency, config, script, and README note.
- What's remaining: none.
- Blockers/open questions: none.
