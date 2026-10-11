#!/usr/bin/env bash
# Install a static ffmpeg build for the score video e2e. It is faster than apt,
# which spends most of its time on update and dependency setup.
set -euo pipefail

dir="$RUNNER_TEMP/ffmpeg"
mkdir -p "$dir"
curl -fsSL https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz |
  tar -xJ -C "$dir" --strip-components=2 --wildcards '*/bin/ffmpeg'
echo "$dir" >>"$GITHUB_PATH"
