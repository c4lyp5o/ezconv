# ✨ ezconv ✨

A modern, client-side file conversion tool that runs entirely in your browser. No uploads, no waiting, just instant conversions.

## 🚀 Features

-   **🔒 Private & Secure**: Files are processed locally in your browser and never leave your device.
-   **⚡ Blazing Fast**: Data and image conversions are near-instant. Media conversions are powered by WebAssembly.
-   **🖼️ Image Conversion**: Convert between `PNG`, `JPEG`, `WEBP`, `BMP`, and `GIF`.
-   **🎵 Audio & 📹 Video Conversion**: Powered by `ffmpeg.wasm`, convert between common audio and video formats.
-   **📊 Data Conversion**: Switch between `JSON`, `CSV`, and `XLSX`.
-   **🖥️ Modern UI**: Sleek, responsive, and includes a dark mode by default.

## 🛠️ Tech Stack

-   **Frontend**: React
-   **Core Logic**: Web Workers for non-blocking UI
-   **Media Conversion**: FFmpeg.wasm
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
2.  Install the dependencies:

    ```bash
    bun install
    ```

### Running the Development Server

To start the local development server, run:
```bash
bun dev
```

## 🔄 Supported Conversions

-   **Data**: `JSON` ↔ `CSV` ↔ `XLSX`
-   **Images**: `PNG`, `JPEG`, `GIF`, `BMP`, `WEBP`
-   **Audio**: `MP3`, `WAV`, `AAC`, `FLAC`, `OGG`, `M4A`
-   **Video**: `MP4`, `AVI`, `MKV`, `MOV`, `WEBM`, `FLV`
