# MT3 Evaluation

`tools/mt3-infer.py` is an offline evaluation harness for testing MT3-family transcription quality before considering app integration. It runs inference on CPU, preserves the model's instrument tracks in the generated MIDI, and converts model event seconds to ticks at a chosen toy-midi project tempo.

## Setup

Install [uv](https://docs.astral.sh/uv/) and pnpm, then run from the repository root:

```sh
uv sync
pnpm install
uv run hf download gudgud1014/MR-MT3 mt3.pth \
  --local-dir .tmp/mt3-checkpoints/mr_mt3
mkdir -p .tmp/mt3-checkpoints/mt3_pytorch
curl --fail --location \
  https://raw.githubusercontent.com/kunato/mt3-pytorch/master/pretrained/config.json \
  --output .tmp/mt3-checkpoints/mt3_pytorch/config.json
ln -sfn ../mr_mt3/mt3.pth \
  .tmp/mt3-checkpoints/mt3_pytorch/mt3.pth
uv run hf download mimbres/YourMT3 \
  amt/logs/2024/mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops/checkpoints/last.ckpt \
  --repo-type space \
  --local-dir .tmp/mt3-checkpoints
```

The uv project selects Python 3.11 and CPU-only PyTorch wheels. No system Python 3.14 environment is used. These commands fetch only the targeted checkpoints and can be rerun safely. `mr_mt3` and `mt3_pytorch` use the same weights, so the latter links to the existing file instead of storing a duplicate.

Run the harness through uv:

```sh
uv run python tools/mt3-infer.py <input-audio> [options]
```

Options:

- `--model`: mt3-infer model identifier (default `yourmt3`)
- `--start`: excerpt start in seconds (default `0`)
- `--duration`: excerpt duration in seconds (default through the end)
- `--bpm`: target toy-midi project tempo (default `120`)
- `--offset`: additional output placement in seconds (default `0`)
- `--midi`: output path (default `.tmp/mt3-output.mid`)

## Smoke Test

Use the deterministic four-tone fixture to exercise audio loading, each model, and MIDI writing:

```sh
uv run python tools/mt3-infer.py e2e/fixtures/test-tones.wav \
  --model mr_mt3 \
  --duration 4 \
  --midi .tmp/mt3-smoke-mr-mt3.mid
uv run python tools/mt3-infer.py e2e/fixtures/test-tones.wav \
  --model mt3_pytorch \
  --duration 4 \
  --midi .tmp/mt3-smoke-mt3-pytorch.mid
uv run python tools/mt3-infer.py e2e/fixtures/test-tones.wav \
  --model yourmt3 \
  --duration 4 \
  --midi .tmp/mt3-smoke-yourmt3.mid
```

This only verifies that the inference path runs. Synthetic-tone transcription quality is not evidence that a model will be useful on real music.

Results from the four-second fixture on CPU:

| Model         | Checkpoint | Role                             | Inference | Fixture output                  |
| ------------- | ---------: | -------------------------------- | --------: | ------------------------------- |
| `mr_mt3`      |    175 MiB | Fast MT3 descendant              |      2.5s | 4 notes, 1 track                |
| `mt3_pytorch` |    175 MiB | Closest established MT3 baseline |     11.8s | 32 notes, 2 note-bearing tracks |
| `yourmt3`     |    536 MiB | Larger PerceiverTF/MoE system    |     11.7s | 3 notes, 1 clean-guitar track   |

The timings are one local run and are only useful as a rough relative cost. Compare transcription quality on the same representative real excerpt before selecting a model.

## Real Excerpt

Choose a representative excerpt and match `--bpm` to the toy-midi project tempo:

```sh
uv run python tools/mt3-infer.py path/to/audio.wav \
  --start 42.5 \
  --duration 20 \
  --bpm 96 \
  --offset 1.25 \
  --midi .tmp/mt3-excerpt.mid
```

Model event times are placed at `--start + --offset` before conversion to ticks. Use `--start` for the excerpt's position in the source audio and `--offset` for any additional placement of that audio track in the toy-midi project.

### Bass Stem Trial

The first 15 seconds of the isolated bass stem from PRIMROSE's `Ring` live clip were tested at 105 BPM with a 4.671-second project offset:

| Model         | Inference | Output                                                |
| ------------- | --------: | ----------------------------------------------------- |
| `mr_mt3`      |      5.0s | 8 notes, pitches 36-50, melodic and percussion events |
| `mt3_pytorch` |      2.7s | No notes                                              |
| `yourmt3`     |     23.7s | No notes                                              |

MR-MT3's first detected note was at 11.189 seconds in the excerpt, or 15.860 seconds after applying the project offset. An earlier 30-second MR-MT3 run produced 72 notes across MIDI pitches 28-102, but visual inspection did not look correct. The percussion events from an isolated bass stem and the empty outputs from the other models mean none of these results was a useful transcription starting point for this excerpt.

## Checkpoints And Output

The setup commands download approximately 711 MiB total: one shared 175 MiB checkpoint for `mr_mt3` and `mt3_pytorch`, plus the 536 MiB YourMT3 checkpoint. They do not require Git LFS or clone either source repository. Inference then reuses the cached checkpoints and can run without network access. MIDI defaults to `.tmp/mt3-output.mid`; `.tmp/` and the uv `.venv/` are gitignored.

Inference is CPU-only and can take substantially longer than the selected excerpt. The checkpoint size, model loading time, and CPU runtime are expected evaluation costs rather than app runtime requirements.

## Import Into toy-midi

1. Load the source audio into a toy-midi project and set the project tempo to the same value passed with `--bpm`.
2. Keep the audio at offset zero when `--offset 0` was used, or pass the audio track's project offset through `--offset` when generating the MIDI.
3. Open Settings, choose **Import MIDI File**, and select the generated `.mid` file.

The MIDI file retains each generated instrument track, its program, and its notes. The current toy-midi importer reads all note-bearing tracks and combines their notes into the single editable MIDI lane, replacing existing notes. It also imports the encoded project tempo, while the ticks produced from `--start` and `--offset` keep notes aligned with the source audio.

Judge real output by whether it is an absolutely useful editing or transcription starting point. This harness is not app integration, and improvement over Basic Pitch alone is not a success criterion.
