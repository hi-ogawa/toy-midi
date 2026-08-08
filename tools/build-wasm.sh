#!/bin/sh
set -eu

package_path="$(realpath node_modules/@hiogawa/bass-pitch-wasm)"
workspace_path="$(realpath crates/bass-pitch-wasm)"

if [ "$package_path" != "$workspace_path" ]; then
  exit 0
fi

if [ -n "${WORKERS_CI:-}" ] && ! command -v cargo >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi

PATH="$HOME/.cargo/bin:$PATH" pnpm -C crates/bass-pitch-wasm build
