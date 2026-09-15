# Manual E2E traces

Run selected E2E tests on a branch, including `main` or a branch without a PR. The result and a **View E2E trace** link appear in the workflow summary and as comments on open PRs headed by that branch. Traces are retained for seven days.

```sh
gh workflow run e2e-trace.yml --ref main \
  -f ref=recorder-midi-e2e \
  -f tests=e2e/recorder-midi.spec.ts
```

Add `-f grep='transcribes'` to filter by test title. You can also run **E2E trace** from the repository's Actions tab.
