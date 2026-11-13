# Changelog

All notable changes to ezconv are documented here. Versions follow Semantic Versioning.

## Unreleased

## [2.0.0] - 2026-11-13

### Breaking deployment changes

- Production is now static frontend files. The unused Bun file server and backend
  dependencies were removed; there is no API, database or runtime `.env`.
- Removed `bun start`, `dev:server`, `install:server`, `install:client`,
  `dev:client`, `build-client` and `build:all`. Use `bun run install:all`,
  `bun run dev`, `bun run build`, and `bun run preview` (local preview only).
- The optional Docker image now serves with unprivileged Nginx. Container port
  5000 is unchanged; runtime `HOST`, `PORT` and `TZ` settings are unused.
- Builds require Bun 1.4.4. Deploy `dist/` at the domain root with proper `.mjs`
  and `.wasm` MIME types. See [release and migration guide](RELEASE.md).

### Added

- Picture/PDF compression: best effort, balanced, best compression, percentage
  reduction, and target file size with a minimum encoder quality.
- PDF merge, split, page extraction/reordering, PNG/JPEG page ZIP exports,
  individual image-to-PDF and combined images-to-PDF.
- Video audio extraction and audio/video trimming; video-to-GIF/animated WebP,
  and GIF-to-video/animated WebP.
- Picture crop, fit-to-size, rotation, background/transparent flattening and
  explicit metadata removal. SVG rendering runs locally in the browser.
- Markdown-to-sanitized-HTML/PDF and text-to-PDF. Document PDFs use rendered
  pages; text is not selectable. Remote images and active content are omitted.
- JSON Lines/NDJSON, YAML and TSV data conversions alongside JSON/CSV/XLSX.
- ZIP content preview, individual extraction, and selected conversion queue additions.
- Built-in Email attachment, Website image and Voice recording recipes; up to
  20 custom recipes stored locally as settings only.
- Static CI artifacts and Bun release packaging with version validation,
  a frontend ZIP, release notes, source commit manifest and SHA-256 checksum.

### Fixed

- Queue IDs fall back when `crypto.randomUUID` is unavailable on HTTP LAN origins; file additions and PDF/image combining still work.
- CSV-to-XLSX now uses supported APIs and preserves identifiers/large integer strings.
- FFmpeg exit codes are checked; temporary files are removed so failed jobs
  cannot return a previous result. Audio extraction maps only the audio stream.
- ZIP exports keep duplicate output filenames with unique suffixes.
- SVG files no longer depend on unsupported worker SVG bitmap decoding.
- Nginx explicitly serves PDF module workers as JavaScript.

### Changed

- Updated dependencies, including React 19.3, Vite 8, Vitest 5 and SheetJS 0.20.3
  from its official release tarball. Bun is the only package manager.
- App and service worker cache versions are aligned at 2.0.0. Offline features
  remain available after first online use of the relevant conversion type.

### Limits

- Stronger PDF compression can flatten text, forms, links and accessibility tags.
  PDF merges copy pages, without document-level forms/bookmarks. Re-saving PDFs
  invalidates digital signatures; encrypted PDFs are unsupported.
- Size budgets are best effort and apply to picture/PDF compression. Unreachable
  targets return the smallest attempted result with a warning.
- ZIP limits: 80 MB input/per file, 200 MB expanded total, 200 entries. Nested
  archives can be extracted but are not automatically queued for conversion.

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
[2.0.0]: https://github.com/c4lyp5o/ezconv/releases/tag/v2.0.0
