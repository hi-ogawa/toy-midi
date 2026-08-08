# Rust Development Workflow

The application normally consumes a prebuilt `@hiogawa/bass-pitch-wasm` package pinned to an immutable pkg.pr.new commit URL. This keeps application development and Cloudflare builds independent of a local Rust toolchain.

Rust changes use a two-phase pull request workflow so the application first tests the workspace source and then verifies the exact published artifact.

## Develop From Source

Add and commit this override in `pnpm-workspace.yaml`:

```yaml
overrides:
  "@hiogawa/bass-pitch-wasm": "workspace:*"
```

Install dependencies and build the workspace package before running application checks:

```sh
pnpm install
pnpm build-wasm
pnpm lint
pnpm test
pnpm build
pnpm test-e2e
```

Keep `pnpm build-wasm` in normal CI while the override is present. This ensures type checking, unit tests, the application build, and browser tests consume the modified Rust implementation.

## Verify The Preview Package

After the pkg.pr.new workflow publishes the pull request commit:

1. Replace the `@hiogawa/bass-pitch-wasm` dependency in `package.json` with the immutable preview URL for that commit.
2. Remove the workspace override from `pnpm-workspace.yaml`.
3. Run `pnpm install` and commit the updated lockfile.
4. Remove `pnpm build-wasm` from normal CI.
5. Rerun the application checks without building WASM locally.

The final pull request state must consume the preview package. This verifies the same packaged JavaScript, declarations, and WASM artifact used by ordinary local development and Cloudflare builds.

The dedicated pkg.pr.new workflow remains responsible for building and publishing the Rust workspace package on pull requests and pushes to `main`.
