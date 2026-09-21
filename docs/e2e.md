# E2E server modes and traces

E2E tests default to a fresh production build served by Vite preview. Use `E2E_SERVER=dev` to run the same tests against the dev server.

```sh
pnpm test-e2e e2e/recorder-score-panel.spec.ts
E2E_SERVER=dev pnpm test-e2e e2e/recorder-score-panel.spec.ts
```

Local runs record DOM traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. Server mode and tracing are independent. CI runs the production build with tracing off by default.

## E2E traces on GitHub Actions

Add the `e2e-trace` label to a same-repository PR to trace changed E2E specs on each push. Find the trace link in the PR description. Remove the label to stop automatic runs.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=recorder-midi-e2e \
  -f tests='e2e/recorder-midi.spec.ts e2e/recorder-mix.spec.ts'
```

The workflow defaults to `server=build`. Add `-f server=dev` to use the dev server. The report identifies the selected mode.

Separate test file filters with spaces. Add `-f grep='transcribes'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
