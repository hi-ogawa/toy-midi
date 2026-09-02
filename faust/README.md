# Faust Development

`capture-meter.dsp` is the reviewed source for the first real-time DSP node. Run
`pnpm build-faust` with Faust 2.85.9 available as `faust`, or set `FAUST_BIN` to
the compiler executable.

The command generates `crates/faust/generated/capture-meter.rs` and builds the
local wasm-pack output under `crates/faust/pkg/`. Both outputs are ignored while
the generated DSP is not wired into the crate's browser ABI. Production WASM
packages will be published through pkg.pr.new.
