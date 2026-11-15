# E2E Tests

E2E tests default to a fresh production build served by Vite preview. Use `E2E_SERVER=dev` to run the same tests against the dev server.

```sh
pnpm test-e2e e2e/score-panel.spec.ts
E2E_SERVER=dev pnpm test-e2e e2e/score-panel.spec.ts
```

Local runs record DOM traces in `test-results/trace-pack.html` by default. Use `E2E_TRACE=0` to disable tracing or `pnpm test-e2e-trace` to explicitly enable it. Server mode and tracing are independent. CI runs the production build with tracing off by default.

## E2E Traces on GitHub Actions

A same-repository PR that changes E2E specs traces those specs on each push. Find the trace link in the PR description.

To trace existing specs that the PR does not change, or test a branch manually:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=midi-e2e \
  -f tests='e2e/midi.spec.ts e2e/mix.spec.ts'
```

The workflow defaults to `server=build`. Add `-f server=dev` to use the dev server. The report identifies the selected mode.

Separate test file filters with spaces. Add `-f grep='transcribes'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.

## Write Tests

- Add short narrative comments before each logical phase of an E2E test, describing the user action and expected behavior so the comments alone convey the scenario. Use direct, verb-led wording for actions, such as “Load a backing track.”
- Wrap the body of an E2E helper that performs several page actions in `test.step(name, fn, { box: true })`, so traces and the HTML report show the helper as one named step and a failure points at the spec line that called it.
- Before adding or increasing an E2E timeout, measure the relevant wait with `createCheckpoint()` from `e2e/helpers.ts`. Prefer Playwright's default timeout when it comfortably covers the measured duration. If a custom timeout is needed, allow reasonable headroom and document the measured duration beside it.
