# E2E server modes and traces

E2E tests default to a fresh production build served by Vite preview. Use `E2E_SERVER=dev` to run the same tests against the dev server.

```sh
pnpm test-e2e e2e/recorder-score-panel.spec.ts
E2E_SERVER=dev pnpm test-e2e e2e/recorder-score-panel.spec.ts
```

Local runs record DOM traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. Server mode and tracing are independent. CI runs the production build with tracing off by default.

## E2E traces on GitHub Actions

Add the `e2e-trace` label to a same-repository PR to trace its added, modified, or renamed `e2e/**/*.spec.ts` files against a production build. Adding the label starts a run, and subsequent pushes or reopening the PR start fresh runs while the label remains. Selection uses the whole PR diff, so a follow-up fix still traces specs changed in earlier commits. Deleted specs are excluded.

The trace workflow resolves the branch head when its test job starts and posts a PR comment with the selected files, tested commit, and trace link. A newer run cancels the previous automatic run for that PR. If no specs changed, the workflow skips testing and explains how to choose existing specs manually. Removing the label stops future automatic runs.

The label trigger and PR diff selection live in `e2e-trace-pr.yml`. It checks out the PR head with full history and uses `git diff` from the merge base to select specs, then calls `e2e-trace.yml` with those files and the PR branch name. The shared workflow also supports manual dispatch.

Run selected E2E tests on a branch, including `main` or a branch without a PR. The result and a **View E2E trace** link appear in the workflow summary and as comments on open PRs headed by that branch.

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=recorder-midi-e2e \
  -f tests='e2e/recorder-midi.spec.ts e2e/recorder-mix.spec.ts'
```

The workflow defaults to `server=build`. Add `-f server=dev` to use the dev server. The report identifies the selected mode.

Separate test file filters with spaces. Add `-f grep='transcribes'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
