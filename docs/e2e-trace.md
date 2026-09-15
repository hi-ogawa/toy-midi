# Manual E2E traces

Run selected E2E tests for a PR and post the result and a **View E2E trace** link as a PR comment. Traces are retained for seven days.

```sh
gh workflow run e2e-trace.yml --ref main \
  -f pr=538 \
  -f tests=e2e/recorder-midi.spec.ts
```

Add `-f grep='transcribes'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
