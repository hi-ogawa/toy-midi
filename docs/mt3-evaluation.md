# MT3 Evaluation

`tools/mt3-infer.py` is an offline evaluation harness for testing MT3-family transcription quality before considering app integration. It runs inference on CPU, preserves the model's instrument tracks in the generated MIDI, and converts model event seconds to ticks at a chosen toy-midi project tempo.

## Setup

Install [uv](https://docs.astral.sh/uv/) and pnpm, then run from the repository root:

```sh
uv sync
pnpm install
```

The uv project selects Python 3.11 and CPU-only PyTorch wheels. No system Python 3.14 environment is used.

Run the harness through the package script:

```sh
pnpm mt3-infer <input-audio> [options]
```

Options:

- `--model`: mt3-infer model identifier (default `yourmt3`)
- `--start`: excerpt start in seconds (default `0`)
- `--duration`: excerpt duration in seconds (default through the end)
- `--bpm`: target toy-midi project tempo (default `120`)
- `--offset`: additional output placement in seconds (default `0`)
- `--midi`: output path (default `.tmp/mt3-output.mid`)

## Smoke Test

Use the deterministic four-tone fixture to exercise audio loading, model inference, and MIDI writing:

```sh
pnpm mt3-infer e2e/fixtures/test-tones.wav \
  --duration 4 \
  --midi .tmp/mt3-smoke.mid
```

This only verifies that the inference path runs. Synthetic-tone transcription quality is not evidence that a model will be useful on real music.

## Real Excerpt

Choose a representative excerpt and match `--bpm` to the toy-midi project tempo:

```sh
pnpm mt3-infer path/to/audio.wav \
  --start 42.5 \
  --duration 20 \
  --bpm 96 \
  --offset 1.25 \
  --midi .tmp/mt3-excerpt.mid
```

Model event times are placed at `--start + --offset` before conversion to ticks. Use `--start` for the excerpt's position in the source audio and `--offset` for any additional placement of that audio track in the toy-midi project.

## Checkpoints And Output

The first `yourmt3` run downloads its approximately 536 MB checkpoint to `.tmp/mt3-checkpoints/`. Later runs reuse it and can run without network access. MIDI defaults to `.tmp/mt3-output.mid`; `.tmp/` and the uv `.venv/` are gitignored.

Inference is CPU-only and can take substantially longer than the selected excerpt. The checkpoint size, model loading time, and CPU runtime are expected evaluation costs rather than app runtime requirements.

## Import Into toy-midi

1. Load the source audio into a toy-midi project and set the project tempo to the same value passed with `--bpm`.
2. Keep the audio at offset zero when `--offset 0` was used, or pass the audio track's project offset through `--offset` when generating the MIDI.
3. Open Settings, choose **Import MIDI File**, and select the generated `.mid` file.

The MIDI file retains each generated instrument track, its program, and its notes. The current toy-midi importer reads all note-bearing tracks and combines their notes into the single editable MIDI lane, replacing existing notes. It also imports the encoded project tempo, while the ticks produced from `--start` and `--offset` keep notes aligned with the source audio.

Judge real output by whether it is an absolutely useful editing or transcription starting point. This harness is not app integration, and improvement over Basic Pitch alone is not a success criterion.
