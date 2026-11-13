# Developer Guide

How ezconv is put together. Everything runs client-side: the production output is static files with no application backend. Files never leave the browser.

## Architecture

```
Browser ── fetch ──> Static host (serves dist/)
   │
   ├── React UI (client/src/App.jsx)  ── postMessage ──> Web Worker (client/src/worker.js)
   │        │                                                │
   │        │ <── { status: done | error | progress | log } ─┘
   │        │
   │        └── conversion results: Blob + object URL (kept for the result card)
   │
   └── ffmpeg.wasm core (self-hosted asset, loaded lazily on first media job)
```

### Module map (client/src/)

| File                        | What it owns                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `App.jsx`                   | jobs model, worker effect, run bookkeeping (`runRef`), keyboard/clipboard listeners, layout |
| `worker.js`                 | all conversion logic + the message dispatch; imports `file-config.js`                       |
| `file-config.js`            | extension → category tables, per-category default targets, canvas export MIME map           |
| `format.js`                 | `defaultTargetFor`, `getFileExtension`, `humanBytes`, `sizeNote`                            |
| `components/Toast.jsx`      | single toast (notes for non-fatal warnings)                                                 |
| `components/DropZone.jsx`   | multi-file drop area + `<input type=file multiple>`                                         |
| `components/JobRow.jsx`     | one queue row: name, target select, status, progress, remove                                |
| `components/ResultCard.jsx` | preview/re-download/copy for the last single-run result                                     |
| `components/LogsPanel.jsx`  | live FFmpeg log lines                                                                       |

## Worker protocol

Request (App → worker), one message per file — the in-worker promise `queue`
serializes them, so a batch is strictly sequential:

```js
{
  jobId,            // correlation id — every reply carries it back
  filename, target, ext,
  text,             // for text/* and data files
  arrayBuffer,      // for image/ and media files
  quality,          // 0.50–1.00, lossy image targets only
  mediaOptions: { resolution: "original"|"1080"|"720"|"480", bitrate: 128|192|256 }
}
```

Reply (worker → App) — `post()` in `worker.js` stamps `jobId` on **every** message:

```js
{ status: "progress", jobId, progress }        // 0..1, ffmpeg only
{ status: "log",      jobId, message }         // ffmpeg stderr lines
{ status: "done",     jobId, filename, output, warnings[] }
{ status: "error",    jobId, message }         // exactly one per failed job
```

`warnings[]` carries unavoidable-lossy notes (multi-sheet first-sheet export,
GIF flatten); the toast shows them via its `note` slot. Failures post **one**
error message — the inner catch blocks rethrow instead of double-posting.

## Media pipeline

`buildMediaArgs()` (exported from `worker.js`, unit-tested) is the single source
of truth for ffmpeg arguments:

- same extension + known media → `-c copy` stream remux (options ignored, by design)
- video or video-target → optional `-vf scale='min(W,iw)':'-2'` (`Original` = no
  `-vf`), codec per target (`libvpx`+vorbis for webm, `libx264`+aac otherwise),
  `-b:a <bitrate>k` on re-encodes
- audio → bare conversion; `-b:a` only for lossy targets (`mp3`, `aac`, `ogg`, `m4a`)

Defaults preserve historical behavior: resolution `720` (the old `min(1280,iw)`
cap), bitrate `192k`.

## Conventions & invariants

- **One result, one URL**: the result card keeps its object URL alive until the
  next result/reset/unmount (`resultUrlRef` revokes it); download URLs are revoked
  after 1s (the click has landed by then).
- **`useCallback([])` for worker-effect deps**: `buildResult`/`downloadResult`/
  `finishIfRunDone` must never change identity, or the worker effect re-fires and
  re-registers the message listener mid-run.
- **liveRef pattern**: event listeners read the latest state through
  `liveRef.current` instead of being re-registered on every keystroke.
- **One toast at a time** (except the persisted `localStorage.theme`).
- Batches summarize ("✓ 3/3 converted"); single runs auto-download and show the result card.

## Build & tooling

- **Bun** everywhere (package manager + the static server runtime).
- **Vite 8** (Rolldown) builds `client/`; the ffmpeg core ships as hashed
  `?url` assets from `@ffmpeg/core` — no CDN, offline-safe.
- **Biome** (root `biome.json`) is the only linter/formatter: tabs, width 100,
  double quotes, semicolons. `bun run lint` / `bun run lint:fix`.
- **Vitest** (happy-dom): `client/tests/` — `conversion.test.js` (library
  round-trips), `file-config.test.js` (targets/MIME honesty), `worker-dispatch.test.js`
  (drives the **real** `self.onmessage` via a `postMessage` shim + `buildMediaArgs` unit tests).

```bash
bun run install:all     # repo tooling + frontend dependencies
bun run lint
bun run test
bun run build
```

## Static deployment

There is no application backend. The former `server.js` only read files from
`dist/`; the frontend never called an API. All conversions remain on the device.

`bun run dev` starts Vite on port 3000. `bun run build` emits the complete site
into the root `dist/`. `bun run preview` previews this output locally and is not
a production server. Deploy `dist/` directly on a static host at the domain root.
No runtime Bun/Node process, `.env`, database, or API configuration is required.

The optional Docker image builds with Bun 1.4.4 and serves with unprivileged
Nginx. `nginx.conf` preserves port 5000, `nosniff`, immutable caching for hashed
assets, and revalidation for other files. `.mjs` and `.wasm` need correct MIME
types. Missing files return 404. Compose only publishes the static host port;
`EZCONV_PORT` changes the host port. Existing reverse proxies can keep targeting
container port 5000. The old runtime `HOST`, `PORT`, and `TZ` variables are unused.

## PWA / offline

`client/public/sw.js` (cache `ezconv-v1`): assets cache-first (the 32 MB
ffmpeg core becomes an offline asset after first use), everything else
network-first with cache fallback. Bump the cache name when shipping an
incompatible asset layout.

## CI

`.github/workflows/ci.yml` validates `main`, `master`, and `development` pushes,
PRs, release tags and manual runs. It installs both lockfiles with Bun, runs
Biome, Vitest and Vite, then uploads `dist/` as `ezconv-dist`. The push-only image
job packages these static files in Nginx and publishes GHCR branch/release tags.
There is no backend build or installation. Optional ntfy notifications remain.

## Dependency maintenance

Use Bun for installs, scripts, tests and updates. Root dependencies are lint
tooling only; frontend dependencies and build/test tooling live in `client/`.
Vite 8 uses `@rolldown/plugin-babel` with `reactCompilerPreset()` for the React
Compiler. SheetJS is pinned to its official 0.20.3 tarball, since npm's `xlsx`
package remains on the older 0.18.5 release. All libraries are bundled into
self-hosted assets at build time; the tarball URL is never fetched by browsers.

## Compression

`compression.js` owns presets, bounded image encoding attempts and size-target
warnings. The worker accepts `target: "compress"` and
`compressionOptions: { mode: "best-effort" | "balanced" | "best-compression" | "percentage", reduction: 50 }`.
Picture compression keeps JPEG/PNG/WebP formats and uses PNG for other inputs.
Results never exceed the original size when the format is unchanged.

PDFs are handled by lazy-loaded `pdf-compression.js` in the browser, using the
same job IDs, progress and result messages as worker jobs. PDF.js parsing runs in
its own worker; page rendering uses DOM canvas/font APIs and yields between pages.
Best effort rewrites with pdf-lib object streams. Other modes can rasterize pages
at bounded DPI and JPEG quality; only the smallest output is retained. Percentage
mode stops at the first candidate meeting its target and reports missed targets.
Vite emits PDF.js cmaps, fonts and wasm under `/pdf/`, with no CDN dependencies.
PDF rasterization removes document semantics and is explicitly described in the UI.

`media-files.js` checks FFmpeg exit codes and removes input/output files in a
finally block. `archive.js` assigns unique ZIP entries, including suffix collisions.
