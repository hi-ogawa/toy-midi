# Manual E2E traces

Run the **E2E trace** workflow with a PR number and a Playwright file filter:

```sh
gh workflow run e2e-trace.yml --ref main \
  -f pr=538 \
  -f tests=e2e/recorder-midi.spec.ts
```

Add `-f grep='transcribes'` to select test titles within that file filter. The `tests` input is one Playwright path regex, so `e2e/(recorder-midi|recorder-mix)\.spec\.ts` selects both files.

The workflow resolves the PR's head SHA once and tests that exact commit, including for stacked PRs. Each run posts a new PR comment with the tested commit, filters, job result, workflow link, and a **View E2E trace** link when a trace pack is available. The HTML is uploaded with `archive: false` and retained for seven days.

Failed tests still upload available traces and report the failure. A setup failure that produces no trace links to the workflow logs. Invalid PR numbers fail before test execution and do not post a comment.

The workflow must be present on the default branch before GitHub accepts manual dispatch. After that, `--ref` can select a workflow revision; the `pr` input still selects the code being tested.
