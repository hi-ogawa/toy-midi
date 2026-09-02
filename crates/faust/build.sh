#!/usr/bin/env bash
set -euo pipefail

cargo build --release --target wasm32-unknown-unknown
rm -rf pkg
mkdir pkg
cp ../../target/wasm32-unknown-unknown/release/faust.wasm pkg/faust.wasm

wasm_base64="$(base64 -w 0 pkg/faust.wasm)"
sed "s|__FAUST_WASM_BASE64__|$wasm_base64|" worklet.template.js > pkg/worklet.js
