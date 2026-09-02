# Faust Development

`capture-meter.dsp` is the reviewed source for the first real-time DSP node.
Install Faust with the system package manager, then run `pnpm build-faust`. Set
`FAUST_BIN` when the compiler is not available as `faust`.

The command generates `crates/faust/generated/capture-meter.rs` and builds the
local wasm-pack output under `crates/faust/pkg/`. The generated Rust is committed
and compiled by the crate, while `pkg/` is ignored because production WASM
packages are published through pkg.pr.new.
