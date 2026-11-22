#!/bin/sh
# Release files attached to the GitHub Release by publish.yml on a vX.Y.Z tag:
# the static build ZIP and checksums from scripts/release.mjs (which installs,
# lints, tests and builds first).
# Usage: scripts/release-assets.sh vX.Y.Z   (writes release-assets/)
set -eu
bun scripts/release.mjs
mkdir -p release-assets
cp release/*/* release-assets/
