//! Native CLI for the grid-guided bass pitch pipeline. Mirrors the flags and
//! outputs of `tools/bass-pitch.py`; see `docs/bass-pitch-evaluation.md`.

use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

use anyhow::{bail, ensure, Context, Result};
use bass_pitch::{diagnostics_csv, midi_bytes, run_pipeline, Params};
use clap::{Parser, ValueEnum};

#[derive(Parser)]
#[command(about = "Extract grid-guided monophonic bass MIDI with pYIN.")]
struct Args {
    /// Input monophonic bass audio path (any format ffmpeg can decode)
    input: PathBuf,
    /// MIDI output path
    #[arg(long, default_value = ".tmp/bass-pitch.mid")]
    midi: PathBuf,
    /// MIDI output stage
    #[arg(long, value_enum, default_value_t = Mode::Segmented)]
    mode: Mode,
    /// Diagnostic CSV path
    #[arg(long, default_value = ".tmp/bass-pitch.csv")]
    csv: PathBuf,
    /// Excerpt start in source seconds
    #[arg(long, default_value_t = 0.0)]
    start: f64,
    /// Excerpt duration in source seconds
    #[arg(long)]
    duration: Option<f64>,
    /// Project tempo
    #[arg(long, default_value_t = 120.0)]
    bpm: f64,
    /// Grid cells per quarter-note beat
    #[arg(long, default_value_t = 2)]
    cells_per_beat: u32,
    /// Project-seconds position of grid cell boundary zero
    #[arg(long, default_value_t = 0.0)]
    grid_origin: f64,
    /// Audio track project offset; project seconds = source seconds + offset
    #[arg(long, default_value_t = 0.0)]
    offset: f64,
    /// Cell RMS dBFS threshold below which activity ends
    #[arg(long, default_value_t = -25.0)]
    activity_off_db: f64,
    /// Cell RMS dBFS threshold at which activity begins
    #[arg(long, default_value_t = -25.0)]
    activity_on_db: f64,
    /// Fixed MIDI pitch for activity-only output
    #[arg(long, default_value_t = 36)]
    activity_pitch: i32,
    /// Minimum pYIN frequency in Hz
    #[arg(long, default_value_t = 30.0)]
    fmin: f64,
    /// Maximum pYIN frequency in Hz
    #[arg(long, default_value_t = 400.0)]
    fmax: f64,
    /// Minimum pYIN voiced probability used for a cell vote
    #[arg(long, default_value_t = 0.5)]
    voicing_threshold: f64,
    /// Minimum fraction of cell frames that must pass the voicing threshold
    #[arg(long, default_value_t = 0.5)]
    min_voiced_coverage: f64,
    /// Same-pitch split threshold for combined boundary evidence
    #[arg(long, default_value_t = 0.4)]
    boundary_onset_threshold: f64,
    /// Seconds searched on each side of a grid boundary
    #[arg(long, default_value_t = 0.06)]
    boundary_tolerance: f64,
    #[arg(long, default_value_t = 22_050)]
    sample_rate: u32,
    #[arg(long, default_value_t = 2048)]
    frame_length: usize,
    #[arg(long, default_value_t = 256)]
    hop_length: usize,
}

#[derive(Clone, Copy, ValueEnum)]
enum Mode {
    Segmented,
    Activity,
    Onset,
    Legacy,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let params = validate_args(&args)?;

    println!("input: {}", args.input.display());
    let audio = decode_excerpt(&args)?;
    ensure!(!audio.is_empty(), "selected excerpt contains no audio");
    let excerpt_end = params.start + audio.len() as f64 / params.sample_rate as f64;
    println!(
        "excerpt: source=[{:.3}, {:.3})s project=[{:.3}, {:.3})s at {}Hz mono",
        params.start,
        excerpt_end,
        params.start + params.offset,
        excerpt_end + params.offset,
        params.sample_rate,
    );

    let started_at = Instant::now();
    let pipeline = run_pipeline(&audio, &params);
    println!(
        "analysis: completed in {:.1}s ({} frames)",
        started_at.elapsed().as_secs_f64(),
        pipeline.frames.times.len(),
    );

    let output_notes = match args.mode {
        Mode::Segmented => &pipeline
            .pitch_decisions
            .iter()
            .map(|decision| decision.note.clone())
            .collect::<Vec<_>>(),
        Mode::Activity => &pipeline.activity_notes,
        Mode::Onset => &pipeline.onset_notes,
        Mode::Legacy => &pipeline.legacy_notes,
    };
    write_output(&args.midi, &midi_bytes(output_notes, params.bpm))?;
    write_output(&args.csv, diagnostics_csv(&pipeline, &params).as_bytes())?;

    let pitched_cells = pipeline
        .cells
        .iter()
        .filter(|cell| cell.pitch.is_some())
        .count();
    let split_count = pipeline
        .boundaries
        .iter()
        .filter(|boundary| boundary.split)
        .count();
    println!(
        "decisions: cells={} pitched={} boundaries={} splits={} notes={}",
        pipeline.cells.len(),
        pitched_cells,
        pipeline.boundaries.len(),
        split_count,
        pipeline.legacy_notes.len(),
    );
    println!(
        "activity: cells={}/{} regions={} thresholds={}/{}dBFS",
        pipeline
            .activity_cells
            .iter()
            .filter(|cell| cell.active)
            .count(),
        pipeline.activity_cells.len(),
        pipeline.activity_notes.len(),
        params.activity_off_db,
        params.activity_on_db,
    );
    let resolved_pitches = pipeline
        .pitch_decisions
        .iter()
        .filter(|decision| decision.evidence_frames > 0)
        .count();
    println!(
        "midi: wrote {} (mode={}, notes={}, pitched={}/{}, bpm={})",
        args.midi.display(),
        match args.mode {
            Mode::Segmented => "segmented",
            Mode::Activity => "activity",
            Mode::Onset => "onset",
            Mode::Legacy => "legacy",
        },
        output_notes.len(),
        resolved_pitches,
        pipeline.pitch_decisions.len(),
        params.bpm,
    );
    println!("diagnostics: wrote {}", args.csv.display());
    Ok(())
}

fn validate_args(args: &Args) -> Result<Params> {
    ensure!(
        args.input.is_file(),
        "input audio does not exist: {}",
        args.input.display()
    );
    ensure!(args.start >= 0.0, "--start must be non-negative");
    if let Some(duration) = args.duration {
        ensure!(duration > 0.0, "--duration must be positive");
    }
    ensure!(args.bpm > 0.0, "--bpm must be positive");
    ensure!(args.cells_per_beat > 0, "--cells-per-beat must be positive");
    ensure!(
        args.activity_off_db <= args.activity_on_db,
        "--activity-off-db must be less than or equal to --activity-on-db"
    );
    ensure!(
        (0..=127).contains(&args.activity_pitch),
        "--activity-pitch must be between 0 and 127"
    );
    ensure!(
        args.start + args.offset >= 0.0,
        "--start + --offset must be non-negative because MIDI cannot encode it"
    );
    ensure!(
        args.fmin > 0.0 && args.fmax > args.fmin,
        "--fmin must be positive and less than --fmax"
    );
    for (name, value) in [
        ("--voicing-threshold", args.voicing_threshold),
        ("--min-voiced-coverage", args.min_voiced_coverage),
        ("--boundary-onset-threshold", args.boundary_onset_threshold),
    ] {
        ensure!(
            (0.0..=1.0).contains(&value),
            "{name} must be between 0 and 1"
        );
    }
    ensure!(
        args.boundary_tolerance >= 0.0,
        "--boundary-tolerance must be non-negative"
    );
    ensure!(
        args.sample_rate > 0 && args.frame_length > 0 && args.hop_length > 0,
        "sample rate and frame/hop lengths must be positive"
    );
    Ok(Params {
        start: args.start,
        offset: args.offset,
        bpm: args.bpm,
        cells_per_beat: args.cells_per_beat,
        grid_origin: args.grid_origin,
        activity_off_db: args.activity_off_db,
        activity_on_db: args.activity_on_db,
        activity_pitch: args.activity_pitch,
        fmin: args.fmin,
        fmax: args.fmax,
        voicing_threshold: args.voicing_threshold,
        min_voiced_coverage: args.min_voiced_coverage,
        boundary_onset_threshold: args.boundary_onset_threshold,
        boundary_tolerance: args.boundary_tolerance,
        sample_rate: args.sample_rate,
        frame_length: args.frame_length,
        hop_length: args.hop_length,
    })
}

/// Decode via ffmpeg into f32 at the analysis rate and average the channels,
/// matching librosa's plain channel mean; ffmpeg's own `-ac 1` downmix applies
/// a different gain, which shifts every activity dBFS decision. `-ss`/`-t` are
/// output options, so the excerpt is trimmed sample-accurately after decoding.
fn decode_excerpt(args: &Args) -> Result<Vec<f32>> {
    let channels_output = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "a:0"])
        .args(["-show_entries", "stream=channels", "-of", "csv=p=0"])
        .arg(&args.input)
        .output()
        .context("failed to run ffprobe")?;
    if !channels_output.status.success() {
        bail!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&channels_output.stderr).trim()
        );
    }
    let channels: usize = String::from_utf8_lossy(&channels_output.stdout)
        .trim()
        .parse()
        .context("failed to parse ffprobe channel count")?;
    ensure!(channels > 0, "input has no audio channels");

    let mut command = Command::new("ffmpeg");
    command.args(["-loglevel", "error", "-i"]).arg(&args.input);
    if args.start > 0.0 {
        command.args(["-ss", &args.start.to_string()]);
    }
    if let Some(duration) = args.duration {
        command.args(["-t", &duration.to_string()]);
    }
    command.args(["-vn", "-ar", &args.sample_rate.to_string()]);
    command.args(["-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"]);
    let output = command.output().context("failed to run ffmpeg")?;
    if !output.status.success() {
        bail!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let samples: Vec<f32> = output
        .stdout
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().expect("4-byte chunk")))
        .collect();
    Ok(samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect())
}

fn write_output(path: &PathBuf, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes).with_context(|| format!("failed to write {}", path.display()))
}
