# ✨ ezconv ✨

[![CI](https://github.com/c4lyp5o/ezconv/actions/workflows/ci.yml/badge.svg)](https://github.com/c4lyp5o/ezconv/actions/workflows/ci.yml)

A modern, client-side file conversion tool that runs entirely in your browser. No uploads, no accounts, just instant conversions.

## 🚀 Features

-   **🔒 Private & Secure**: Files are processed locally in your browser and never leave your device. The FFmpeg core is self-hosted — zero third-party requests.
-   **⚡ Fast**: Data and image conversions are near-instant. Media conversions run on WebAssembly in a Web Worker with a real progress bar and live FFmpeg logs.
-   **📚 Batch Conversion**: Drop or pick multiple files — per-file targets, status and progress, then convert all and download a single ZIP (or single results straight to your downloads folder).
-   **🖼️ Image Conversion**: Read `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`, `SVG` → write `PNG`, `JPEG`, `WEBP`, with a quality slider for the lossy targets.
-   **🎵 Audio & 📹 Video Conversion**: Powered by `ffmpeg.wasm`, with max-resolution (1080p/720p/480p/Original) and audio-bitrate (128/192/256 kbps) controls.
-   **📊 Data Conversion**: Switch between `JSON`, `CSV`, and `XLSX` (plus `XLS` as input). Workbooks keep every sheet on `XLSX` export.
-   **📱 Installable & Offline**: PWA with a service worker — install it, convert offline (the FFmpeg core is cached on first media use).
-   **⌨️ Handy**: Paste files from the clipboard (`Ctrl+V`), `Enter` to convert, `Ctrl+O` to browse. The result card shows previews, before/after sizes, re-download and copy-to-clipboard.
-   **🖥️ Modern UI**: Sleek, responsive, dark mode by default, respects `prefers-reduced-motion`.

## 🛠️ Tech Stack

-   **Frontend**: React
-   **Core Logic**: Web Workers for non-blocking UI
-   **Media Conversion**: FFmpeg.wasm (core bundled and served locally, ~28 MB on first media conversion)
-   **Styling**: Tailwind CSS
-   **Package Manager**: Bun

## 🏁 Getting Started

### Prerequisites

You need to have Bun installed on your system.

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/c4lyp5o/ezconv.git
    cd ezconv
    ```
2.  Install server and client dependencies:

    ```bash
    bun run install:all
    ```

### Running the Development Server

To start the local development server (client on `:3000`, API on `:5000`), run:

```bash
bun dev
```

### Production

```bash
bun run build:all
bun start
```

## 🐳 Docker

Builds and runs with no `.env` needed — the image is reproducible from the lockfile and runs as a non-root user:

```bash
docker build -t ezconv .
docker run -p 5000:5000 ezconv
```

## 🌐 Serving & LAN

The static server binds **loopback by default**. Serve it to your LAN (e.g. test-drive from a phone) with the `HOST` env var; the port comes from `PORT`:

```bash
HOST=0.0.0.0 PORT=5000 bun start
```

The Docker image sets `HOST=0.0.0.0` internally (the published port is the boundary there).

**PWA / offline**: the app is installable (`manifest.webmanifest`, service worker). Assets including the FFmpeg core are cached cache-first after first use — conversions then work fully offline.

## 🔄 Supported Conversions

-   **Data**: `JSON` ↔ `CSV` ↔ `XLSX`; `XLS` readable as input. Converting a multi-sheet workbook to `JSON`/`CSV` exports the first sheet with a warning; the `XLSX` target keeps every sheet.
-   **Images**: read `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`, `SVG` → write `PNG`, `JPEG`, `WEBP` (browsers cannot encode `GIF`/`BMP`, so those targets are not offered; GIF animations flatten to a single frame).
-   **Audio**: `MP3`, `WAV`, `AAC`, `FLAC`, `OGG`, `M4A`
-   **Video**: `MP4`, `AVI`, `MKV`, `MOV`, `WEBM`, `FLV`

## 🧪 Tests & CI

```bash
bun run lint                      # Biome over the whole repo
cd client && bunx vitest run      # 29 tests, incl. real worker-dispatch harness
```

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same gate on every push/PR, then builds and pushes the GHCR image (`:main`/`:latest` from main, `:development` from development — only when the gate is green).

## 📚 Docs

-   [CHANGELOG.md](CHANGELOG.md) — release history
-   [DEVELOPER.md](DEVELOPER.md) — architecture, worker protocol, build chain
