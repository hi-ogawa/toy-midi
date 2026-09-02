#!/usr/bin/env bash
set -euo pipefail

faust_bin="${FAUST_BIN:-faust}"

if ! command -v "$faust_bin" >/dev/null; then
  echo "Faust is required. Set FAUST_BIN to its executable." >&2
  exit 1
fi

"$faust_bin" \
  -lang rust \
  -cn CaptureMeter \
  -o crates/faust/generated/capture-meter.rs \
  faust/capture-meter.dsp

pnpm -C crates/faust build
