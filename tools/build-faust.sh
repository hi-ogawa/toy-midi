#!/usr/bin/env bash
set -euo pipefail

faust_bin="${FAUST_BIN:-faust}"
expected_version="2.85.9"

if ! command -v "$faust_bin" >/dev/null; then
  echo "Faust $expected_version is required. Set FAUST_BIN to its executable." >&2
  exit 1
fi

actual_version="$($faust_bin --version | sed -n '1s/.*version //p')"
if [ "$actual_version" != "$expected_version" ]; then
  echo "Expected Faust $expected_version, found ${actual_version:-unknown}." >&2
  exit 1
fi

"$faust_bin" \
  -lang rust \
  -cn CaptureMeter \
  -o crates/faust/generated/capture-meter.rs \
  faust/capture-meter.dsp

pnpm -C crates/faust build
