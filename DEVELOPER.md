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

| Module                                 | Responsibility                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `App.jsx`                              | Queue state, browser/worker dispatch, run totals, keyboard/paste, download URLs     |
| `worker.js`                            | Serialized data, raster image and media jobs; FFmpeg initialization and messages    |
| `browser-conversion.js`                | DOM-dependent PDF, text and SVG job dispatch                                        |
| `file-config.js`, `format.js`          | Input categories, targets/labels, defaults and size formatting                      |
| `data-conversion.js`                   | Papa Parse, SheetJS and YAML conversion                                             |
| `image-tools.js`, `svg-tools.js`       | Canvas transforms and browser SVG rasterization                                     |
| `compression.js`, `pdf-compression.js` | Compression plans, size budgets and candidate selection                             |
| `pdf-tools.js`, `text-tools.js`        | PDF page operations, image/document PDF output and sanitized HTML                   |
| `archive.js`, `zip-tools.js`           | Collision-free ZIP exports and bounded ZIP preview/extraction                       |
| `recipes.js`                           | Built-in presets and persisted recipe validation                                    |
| `components/`                          | Queue rows/options, ZIP preview, recipes, output controls, results, logs and toasts |
| `ez/`                                  | Shared shell, theme, controls and motion                                            |

## Job protocol

The UI reads each input and sends worker jobs with transferable binary buffers.
`ConversionWorker` lazily creates the native worker, isolates stale messages after
a crash, fails only outstanding worker job IDs, and creates a fresh worker on retry.
Worker jobs run serially; DOM-dependent jobs are awaited by the UI dispatch loop
and can overlap a previously posted worker job. All completions share job IDs
and run bookkeeping. PDF parsing uses PDF.js's own worker.

```js
// UI → worker
{
  action: "convert", jobId, filename, target, ext,
  text, arrayBuffer, quality,
  imageOptions: { width, height, cropX, cropY, cropWidth, cropHeight, rotate,
    flatten, background, stripMetadata },
  mediaOptions: { resolution, bitrate, trimStart, trimEnd },
  compressionOptions: { mode, reduction, targetMB, minQuality }
}
// Worker → UI (jobId is included on every message)
{ status: "ffmpeg-loading" | "ffmpeg-ready", jobId }
{ status: "log" | "ffmpeg-log", jobId, message }
{ status: "ffmpeg-progress", jobId, ratio } // 0..1
{ status: "done", jobId, filename, buffer, mime, warnings }
{ status: "error", jobId, message }
```

Browser jobs feed the same completion handler with `done` and
`compression-progress` messages (`jobId`, `ratio`). Their buffers are not
transferred across threads. Warnings are visible in the result row/card and
single-run toast; each failed worker job posts one error.

## Conversion pipelines

`worker.js` serializes data/image/media jobs. `buildMediaArgs()` owns audio stream
mapping, codec selection, trim validation, single-thread encoding, and animation
settings. Stream copy only applies without encoding/trim options. Media outputs
pass through `media-files.js` for exit checks, exact buffer slicing and cleanup.

`data-conversion.js` uses Papa Parse, SheetJS and YAML. CSV/TSV preserve strings;
JSON Lines report the failing line. YAML alias expansion is bounded. XLSX output
preserves every sheet; text exports warn about the first-sheet-only behavior.

`image-tools.js` crops first, fits within dimensions without upscaling, rotates,
and optionally fills a background. Canvas re-encoding removes source metadata.
`compression.js` keeps same-format originals only when edits/metadata stripping
were not requested. Image operations are capped at 40 megapixels / 12000px.
SVG jobs use `svg-tools.js` on the browser thread because worker ImageBitmap
cannot decode SVG reliably; sanitized SVG is rendered without external images.

`browser-conversion.js` dispatches DOM-dependent jobs through the same completion
handler/job IDs. `pdf-tools.js` merges or extracts PDF pages with pdf-lib, combines
pictures into PDF, and renders selected pages to PNG/JPEG inside ZIPs. PDF ranges
are 1-based, preserve requested order and deduplicate overlapping selections.
`text-tools.js` sanitizes Markdown HTML with DOMPurify and renders paginated
Unicode text/basic Markdown PDFs with canvas. These PDF pages are images, with
no selectable text; the UI explains that before conversion. PDF.js parsing runs
in its own worker. Rendering yields between document pages.

`zip-tools.js` inspects JSZip's uncompressed size metadata before extracting a
selection. Limits are 80 MB input/per-file, 200 MB expanded total, 200 entries.
Extracted download names use the leaf filename. `ArchivePanel` handles previews,
per-entry extraction and selected queue additions. Nested archives are never
automatically queued. Archive rows are excluded from Convert all.

`recipes.js` provides built-in recipes and validates loading browser-saved
settings. Recipes persist only settings in localStorage (up to 20), never files.
The UI applies target/encoder settings to queued and newly added files. Saving
uses the first queued file per category for target and per-file options.

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

- **Bun 1.4.4** for package management, scripts and release packaging; production has no Bun runtime.
- **Vite 8** (Rolldown) builds `client/`; the ffmpeg core ships as hashed
  `?url` assets from `@ffmpeg/core` — no CDN, offline-safe.
- **Biome** (root `biome.json`) is the only linter/formatter: tabs, width 100,
  double quotes, semicolons. `bun run lint` / `bun run lint:fix`.
- **Vitest 5**: happy-dom by default; `tools.test.js` uses jsdom for DOMPurify
  sanitization tests. Coverage includes worker dispatch, CSV/XLSX fidelity,
  media arguments and cleanup, ZIP collisions/limits, PDF page operations,
  extended data formats, target budgets and HTML sanitization.

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

`client/public/sw.js` (cache `ezconv-v2.0.0`): assets cache-first (the 32 MB
ffmpeg core becomes an offline asset after first use), everything else
network-first with cache fallback. The release validator keeps the cache name aligned with the package version.
Only successful full (HTTP 200) responses are cached. Cached errors are ignored;
cache writes extend the fetch event lifetime and storage failures do not block responses.
Older caches are retained for open tabs/offline fallback; they are not deleted
on activation. Only features/assets already fetched online are available offline.

## CI

`.github/workflows/ci.yml` validates `main`, `master`, and `development` pushes,
PRs, release tags and manual runs. It installs both lockfiles with Bun, runs
release metadata validation, Biome, Vitest and Vite, then uploads `dist/` as
`ezconv-dist` and a versioned frontend ZIP/checksum/notes as `ezconv-release`. The push-only image
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
`compressionOptions: { mode: "best-effort" | "balanced" | "best-compression" | "percentage" | "size", reduction: 50, targetMB: 2, minQuality: 0.3 }`.
Picture compression keeps JPEG/PNG/WebP formats and uses PNG for other inputs.
Results never exceed the original size when the format is unchanged and no explicit edits or metadata removal were requested.

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

`compressionTarget()` distinguishes a percentage of input bytes from an absolute
MB budget. Size mode never lowers encoder quality below `minQuality`, but may
reduce dimensions/DPI. Missed targets return the smallest candidate with a
warning. PNG quality is fixed by browsers, so resizing is its primary reduction.

## Release preparation

See [RELEASE.md](RELEASE.md) for the 2.0.0 migration and operator procedure.
Root/client package versions, service worker cache, changelog and tag must agree.
`bun run release:validate` checks metadata only. From a clean committed tree,
`bun run release:prepare` installs frozen lockfiles, runs lint/tests/build and
writes `release/<version>/` (ignored by Git). `scripts/release.mjs --package-only`
is for CI after those checks/build have already passed. Packaging never creates
Git tags, publishes releases/images, pushes commits or deploys a site.
