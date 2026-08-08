# Rust Development Workflow

The application normally consumes a prebuilt `@hiogawa/bass-pitch-wasm` package pinned to an immutable pkg.pr.new commit URL. This keeps application development and Cloudflare builds independent of a local Rust toolchain.

Rust changes use a two-phase pull request workflow so the application first tests the workspace source and then verifies the exact published artifact. The workspace override is the only build-mode switch: local builds, CI, and Cloudflare automatically build Rust when it is enabled and otherwise use the prebuilt package.

## Develop From Source

Add and commit this override in `pnpm-workspace.yaml`:

```yaml
overrides:
  "@hiogawa/bass-pitch-wasm": "workspace:*"
```

Regenerate and commit the lockfile after enabling the override:

```sh
pnpm install
```

No scripts or workflows need changing. `pnpm build-wasm` detects that pnpm resolved the dependency to the workspace and builds it. The existing application build, CI, and Cloudflare commands call this script, so they all consume the modified Rust implementation.

## Verify The Preview Package

After the pkg.pr.new workflow publishes the pull request commit:

1. Replace the `@hiogawa/bass-pitch-wasm` dependency in `package.json` with the immutable preview URL for that commit.
2. Remove the workspace override from `pnpm-workspace.yaml`.
3. Run `pnpm install` and commit the updated lockfile.
4. Rerun the application checks. `pnpm build-wasm` now skips compilation because the dependency resolves to the preview package.

The final pull request state must consume the preview package. This verifies the same packaged JavaScript, declarations, and WASM artifact used by ordinary local development and Cloudflare builds.

The dedicated pkg.pr.new workflow always builds and publishes the Rust workspace package on pull requests and pushes to `main`, independently of the application dependency override.
