#!/usr/bin/env bash
set -euo pipefail

package_path="$(realpath node_modules/@hiogawa/bass-pitch-wasm)"
workspace_path="$(realpath crates/bass-pitch-wasm)"

if [ "$package_path" != "$workspace_path" ]; then
  echo "Skipped build. Using prebuilt WASM package."
  exit 0
fi

# Auto install rust on Cloudflare CI/CD
if [ -n "${WORKERS_CI:-}" ] && ! command -v cargo >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
fi

pnpm -C crates/bass-pitch-wasm build
