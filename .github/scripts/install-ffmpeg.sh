#!/usr/bin/env bash
# Install a static ffmpeg build for the score video e2e. It is faster than apt,
# which spends most of its time on update and dependency setup.
set -euo pipefail

dir="$RUNNER_TEMP/ffmpeg"
mkdir -p "$dir"
# Download through gh so the request is authenticated and avoids GitHub's
# limits and timeouts for unauthenticated users.
gh release download latest -R BtbN/FFmpeg-Builds -p 'ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz' -O - |
  tar -xJ -C "$dir" --strip-components=2 --wildcards '*/bin/ffmpeg'
echo "$dir" >>"$GITHUB_PATH"
