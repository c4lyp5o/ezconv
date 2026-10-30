# Changelog

All notable changes to ezconv are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-30

The audit, fix and feature pass: correctness first, then the frontend revamp.

### Added

- Batch conversion: multi-file drop/pick, per-row target selection with smart defaults,
  per-row status/progress/remove, "Convert all", and single-ZIP download (JSZip).
  Single-file runs keep classic instant auto-download.
- PWA: `manifest.webmanifest`, generated icons, and a service worker (cache-first
  assets, network-first shell) — installable and fully offline-capable, including
  the FFmpeg core after first use.
- Media output controls: max resolution (Original / 1080p / 720p / 480p, default
  720p) and audio bitrate (128 / 192 / 256 kbps, default 192). Lossless audio
  targets stay unbitrated; same-extension remuxes stay stream-copies.
- Quality slider (50–100%, default 92%) for lossy image targets (`jpg`, `webp`).
- Result card: image preview/thumbnail, re-download, and copy-to-clipboard for
  `json`/`csv`, with before/after size deltas in the result toast.
- Real conversion progress bar wired to FFmpeg's `progress` event, plus a live
  FFmpeg log panel (`log` event) — the API the class actually has.
- Keyboard/clipboard flow: paste files (`Ctrl+V`), `Enter` to convert, `Ctrl+O` to browse.
- `HOST` env var for the static server (loopback default; `0.0.0.0` for LAN
  test-drives). The Docker image sets `HOST=0.0.0.0` internally.
- CI: GitHub Actions test gate (Biome + vitest + vite build) followed by a gated
  GHCR image build (`:main`/`:latest` from main, `:development` from development).
- Worker test harness driving the real `self.onmessage` dispatch; `buildMediaArgs`
  exposed as a pure, unit-tested function. Suite: 29 tests.

### Fixed

- `jpg` exports now really are JPEG: the Canvas path previously emitted PNG bytes
  for `image/jpg`, `image/bmp`, and `image/gif` targets (browsers only encode
  `jpeg`/`png`/`webp`). Those fake targets are removed; `jpg` maps to `image/jpeg`.
- `xls → xlsx` wrote a 9-byte file containing the string "undefined" (JS-XLSX's
  `write` returns a string for `bookType: "xlsx"`); it now writes a real workbook
  with every sheet preserved.
- Object-shaped JSON input produced a 0-byte "successful" CSV; it is now wrapped
  as a single row, scalars are rejected with a clear error, and empty CSV input errors.
- Multi-sheet workbooks silently kept only the first sheet on `json`/`csv` export;
  they now export the first sheet with an explicit warning (the `xlsx` target keeps all).
- Conversion-during-load race: queued messages are serialized in the worker and the
  UI is locked during file reads and FFmpeg loading.
- CSV round-trip typing is faithful (`007` no longer becomes `7`); MIME strings no
  longer carry trailing semicolons; file-size limits added with human-readable notes.
- FFmpeg core is self-hosted from `@ffmpeg/core` (Vite `?url` assets) — no jsdelivr
  fetches, no `@ffmpeg/util` dependency, works offline.
- Docker: no more baked local `.env`; `bun.lock` copied for reproducible frozen
  installs; container runs as non-root (`USER bun`).
- Server: `PORT` read from env (was hardcoded), plus `X-Content-Type-Options: nosniff`
  and proper cache headers (immutable hashed assets); responses stream instead of buffering.
- Failures report exactly one toast; download URLs are revoked after the click has landed.

### Changed

- UI split into modules: `Toast`, `DropZone`, `ResultCard`, `LogsPanel`, `JobRow`,
  and a `format.js` helper module.
- Lint/format unified on Biome (tabs, width 100) across the repo; `@types/bun` pinned.
- `prefers-reduced-motion` is respected across all UI animation.

## [0.x] - before 2026-10-27

Initial client-side converter: React + Bun + vite, a Web Worker with an in-memory
data stack (SheetJS `xlsx`, papaparse) and an ffmpeg.wasm media path; Bun static
server; multi-stage Dockerfile. Tracked in git history.

[1.0.0]: https://github.com/c4lyp5o/ezconv/releases/tag/v1.0.0
