# ✨ ezconv ✨

A modern, client-side file conversion tool that runs entirely in your browser. No uploads, no accounts, just instant conversions.

## 🚀 Features

-   **🔒 Private & Secure**: Files are processed locally in your browser and never leave your device. The FFmpeg core is self-hosted — zero third-party requests.
-   **⚡ Fast**: Data and image conversions are near-instant. Media conversions run on WebAssembly in a Web Worker.
-   **🖼️ Image Conversion**: Read `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`, `SVG` → write `PNG`, `JPEG`, `WEBP`.
-   **🎵 Audio & 📹 Video Conversion**: Powered by `ffmpeg.wasm`, convert between common audio and video formats.
-   **📊 Data Conversion**: Switch between `JSON`, `CSV`, and `XLSX` (plus `XLS` as input).
-   **🖥️ Modern UI**: Sleek, responsive, dark mode by default.

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

## 🔄 Supported Conversions

-   **Data**: `JSON` ↔ `CSV` ↔ `XLSX`; `XLS` readable as input. Converting a multi-sheet workbook to `JSON`/`CSV` exports the first sheet with a warning; the `XLSX` target keeps every sheet.
-   **Images**: read `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`, `SVG` → write `PNG`, `JPEG`, `WEBP` (browsers cannot encode `GIF`/`BMP`, so those targets are not offered; GIF animations flatten to a single frame).
-   **Audio**: `MP3`, `WAV`, `AAC`, `FLAC`, `OGG`, `M4A`
-   **Video**: `MP4`, `AVI`, `MKV`, `MOV`, `WEBM`, `FLV`

## 🧪 Tests

```bash
cd client && bunx vitest run
```
