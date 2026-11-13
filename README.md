# ✨ ezconv ✨

[![CI](https://github.com/c4lyp5o/ezconv/actions/workflows/ci.yml/badge.svg)](https://github.com/c4lyp5o/ezconv/actions/workflows/ci.yml)

A modern, client-side file conversion tool that runs entirely in your browser. No uploads, no accounts, local conversion and compression.

**2.0.0 release preparation:** this is a frontend-only deployment. See the
[release and migration guide](RELEASE.md) for the changes from 1.x.

## 🚀 Features

-   **🔒 Private & Secure**: Files are processed locally in your browser and never leave your device. The FFmpeg core is self-hosted — zero third-party requests.
-   **⚡ Fast**: Data and image conversions are near-instant. Media conversions run on WebAssembly in a Web Worker with a real progress bar and live FFmpeg logs.
-   **📚 Batch Conversion**: Drop or pick multiple files — per-file targets, status and progress, then convert all and download a single ZIP (or single results straight to your downloads folder).
-   **🖼️ Image Conversion**: Read `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`, `SVG` → write `PNG`, `JPEG`, `WEBP`, with a quality slider for the lossy targets.
-   **🎵 Audio & 📹 Video Conversion**: Powered by `ffmpeg.wasm`, with max-resolution (1080p/720p/480p/Original) and audio-bitrate (128/192/256 kbps) controls.
-   **📊 Data Conversion**: Switch between `JSON`, `JSONL`, `YAML`, `CSV`, `TSV`, and `XLSX` (plus `XLS` as input). Workbooks keep every sheet on `XLSX` export.
-   **📱 Installable & Offline**: PWA with a service worker — install it, convert offline (the FFmpeg core is cached on first media use).
-   **⌨️ Handy**: Paste files from the clipboard (`Ctrl+V`), `Enter` to convert, `Ctrl+O` to browse. The result card shows previews, before/after sizes, re-download and copy-to-clipboard.
-   **🖥️ Modern UI**: Sleek, responsive, dark mode by default, respects `prefers-reduced-motion`.

## Picture and PDF compression

Add pictures or PDFs to the queue. Pictures offer **Compress** in the per-file
format menu; PDFs default to compression. The Output panel offers:

- **Best effort**: keeps image dimensions; rewrites PDF object streams while preserving text and document features.
- **Balanced**: moderate quality and resolution reduction.
- **Best compression**: stronger quality and resolution reduction for smaller files.
- **Target file size**: enter a limit in MB and a minimum encoder quality (20–95%). Tries smaller settings and reports if the file cannot fit. Applies to picture/PDF compression.
- **Target percentage reduction**: choose 1–90% smaller (50% means half the original size). Tries progressively smaller settings and reports if the target cannot be reached.

Compression runs locally. Already compact JPEG/PNG/WebP and PDF files are
returned unchanged if the attempted compression would make them larger, unless
you explicitly requested image edits or metadata removal.
PNG compression benefits mainly from reducing dimensions. GIF/BMP/SVG compression
exports PNG; animated GIFs flatten to one frame.

PDF presets other than Best effort can rebuild pages as JPEG images. This removes
selectable text, links, forms, and accessibility tags; the UI warns before running
and the result records when flattening occurred. Re-saving a PDF invalidates its
digital signatures. Password-protected PDFs are not supported. PDF processing is
loaded only when needed, with rendering, fonts and decoding assets served locally.

## More conversion tools

- **PDFs**: choose PNG/JPEG page exports (ZIP), extract/reorder pages with ranges
  such as `3,1-2`, or split into single-page PDFs. Add multiple PDFs for **Merge
  all PDFs**; add multiple pictures for **Combine images into PDF**. Combined
  pages follow queue order. Merge copies pages; document-level forms/bookmarks
  are not preserved. Re-saving invalidates digital signatures.
- **Media**: video targets include MP3/WAV/AAC/FLAC/OGG/M4A for audio extraction,
  GIF, and animated WebP. GIF inputs can become MP4/WebM or animated WebP.
  Expand a file’s trim options to set start/end times in seconds. Animation
  exports use 12 fps; trim long clips to control memory and output size.
- **Pictures**: expand the file’s options to crop in pixels, fit within maximum
  width/height, rotate, flatten transparency against a chosen color, or force
  metadata removal. Crop happens before resize/rotation. JPEG always flattens
  transparency; other targets preserve it unless requested otherwise.
- **Documents**: Markdown → sanitized standalone HTML or PDF; plain text → PDF.
  PDFs render Unicode text and basic headings/lists/code/tables as images, so
  text is not selectable. External images and active HTML are omitted.
- **ZIPs**: preview file names and expanded sizes, extract individual files,
  or select supported files to add to the conversion queue. Limits: 80 MB input
  and per extracted file, 200 MB expanded total, 200 entries. Nested ZIPs can be
  extracted, but are not automatically queued.
- **Recipes**: apply Email attachment, Website image, or Voice recording presets,
  or save up to 20 named recipes. Saved recipes use the first queued file’s
  settings per category. Only settings are stored in localStorage; file contents
  are never persisted. Recipes apply to current and newly added files.

## 🛠️ Tech Stack

-   **Frontend**: React
-   **Core Logic**: Web Workers for non-blocking UI
-   **Media Conversion**: FFmpeg.wasm (core bundled and served locally, ~28 MB on first media conversion)
-   **Styling**: Tailwind CSS
-   **Package Manager**: Bun

## 🏁 Getting Started

### Prerequisites

Use Bun 1.4.4, matching CI and the container builder.

### Install and develop

```bash
bun run install:all
bun run dev                 # Vite at http://localhost:3000
```

Bun is the only package manager used by this repo. There is no API server,
backend install, database, or runtime `.env` configuration.

### Build and deploy

```bash
bun run build               # creates dist/ at the repository root
bun run preview             # local build preview only
```

Deploy **the contents of `dist/`** to a static host (Nginx, Cloudflare Pages,
Netlify, or another static file service). For a repository-connected host, use
`bun run install:all` for installation, `bun run build` for the build command, and
`dist` as the output directory. CI also uploads an `ezconv-dist` artifact.
No JavaScript runtime or backend process is needed in production.

Serve JavaScript modules (`.js` and `.mjs`) with a JavaScript MIME type and `.wasm`
with `application/wasm`. Use HTTPS for the app and PWA/clipboard features; localhost is also
supported. Serve at the domain root, since asset and service worker paths are
root-relative. Missing assets should return 404. Use long immutable caching for
hashed `/assets/` files and revalidate HTML, `sw.js`, and `/pdf/` support files.

### Optional Docker static host

The image builds with Bun and ships only the static frontend in unprivileged
Nginx. It preserves port 5000 for existing reverse-proxy/container deployments:

```bash
docker build -t ezconv .
docker run --rm -p 5000:5000 ezconv
# Or: docker compose up -d --build
```

Compose supports `EZCONV_PORT` for the published port. Former backend `HOST`,
`PORT`, and `TZ` variables are no longer used by the image.

For LAN development, use `bun run dev --host 0.0.0.0` behind HTTPS when opening
from another device; the localhost secure-context exception does not cover LAN IPs.

**PWA / offline**: the shell and fetched assets are cached by the service worker.
Open the app and use each desired conversion/compression type online first;
FFmpeg and PDF assets are loaded on demand, then available offline.

## 🔄 Supported Conversions

- **Data**: JSON, JSON Lines (`.jsonl` / `.ndjson`), YAML (`.yaml` / `.yml`),
  CSV, TSV, XLSX; XLS as input. Tabular outputs require objects/rows. Workbook
  exports to text carry the first sheet with a warning; XLSX keeps all sheets.
- **Images**: PNG, JPEG, GIF, BMP, WebP, SVG inputs → PNG, JPEG, WebP, PDF.
  GIF/animated WebP outputs from video and GIF inputs use FFmpeg.
- **PDF**: compression, merge, split, extract/reorder pages, PNG/JPEG page exports.
- **Documents**: Markdown to HTML/PDF; TXT to PDF.
- **Audio**: MP3, WAV, AAC, FLAC, OGG, M4A; extraction from videos and trimming.
- **Video**: MP4, AVI, MKV, MOV, WebM, FLV; GIF and animated WebP exports.
- **Archives**: ZIP preview, selected extraction, and selected conversion.

## 🧪 Tests & CI

```bash
bun run lint
bun run test
bun run build
```

GitHub Actions ([CI](.github/workflows/ci.yml)) runs the same gate on pushes and
PRs for `main`, `master`, and `development`. It uploads the static `dist/`
artifact and publishes an optional GHCR static-host image on pushes. Production
branches publish `:latest` plus their branch tag; development publishes
`:development`.

## 📚 Docs

- [CHANGELOG.md](CHANGELOG.md) — release history
- [DEVELOPER.md](DEVELOPER.md) — architecture, job protocol, build and deployment
- [RELEASE.md](RELEASE.md) — release preparation, 1.x migration, verification and rollback
