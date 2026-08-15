//! Vendored pYIN library (see Cargo.toml header). Only the C FFI wrapper and
//! the npy-writing binary were removed relative to upstream.

mod pad;
mod pyin;
mod roll;
mod util;
mod viterbi;
mod windows;

pub use pad::{Framing, PadMode};
pub use pyin::PYINExecutor;
