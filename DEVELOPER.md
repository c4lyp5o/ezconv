# Developer Guide

How ezconv is put together. Everything runs client-side: the Bun server only
serves static files. Files never leave the browser.

## Architecture

```
Browser ── fetch ──> Bun static server (server.js, streams dist/)
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
- **Vite** (rolldown-vite) builds `client/`; the ffmpeg core ships as hashed
  `?url` assets from `@ffmpeg/core` — no CDN, offline-safe.
- **Biome** (root `biome.json`) is the only linter/formatter: tabs, width 100,
  double quotes, semicolons. `bun run lint` / `bun run lint:fix`.
- **Vitest** (happy-dom): `client/tests/` — `conversion.test.js` (library
  round-trips), `file-config.test.js` (targets/MIME honesty), `worker-dispatch.test.js`
  (drives the **real** `self.onmessage` via a `postMessage` shim + `buildMediaArgs` unit tests).

```bash
bun run install:all     # root + client
bun run lint            # biome
cd client && bunx vitest run && bun run build
```

## Server & env

`server.js` (Bun `serve`) streams `client/dist/`:

- `PORT` — default `5000`
- `HOST` — default `127.0.0.1` (loopback); `0.0.0.0` to serve the LAN. The
  Dockerfile sets `HOST=0.0.0.0` (the published port is the container boundary).

Hashed `/assets/` responses are `immutable, max-age=31536000`; everything else
is `no-cache`. Unknown paths fall back to `index.html` (SPA-safe 404s).

## PWA / offline

`client/public/sw.js` (cache `ezconv-v1`): assets cache-first (the 32 MB
ffmpeg core becomes an offline asset after first use), everything else
network-first with cache fallback. Bump the cache name when shipping an
incompatible asset layout.

## CI

`.github/workflows/ci.yml` (ala ezhrm): one workflow —

- **test** — Biome + vitest + vite build on pushes to `main`/`development`, PRs,
  and manual dispatch.
- **image** — GHCR build (amd64, buildx + GHA cache), push-only, gated on `test`.
  Tags are branch-explicit: `main` → `:main` + `:latest` + `:sha-<12>`,
  `development` → `:development` + `:sha-<12>` (never `:latest`), `v*` tags →
  `:<tag>`. ntfy notify if `NTFY_URL` is set.

The Docker image is two-stage `oven/bun:1.3-alpine`: frozen-lockfile install of
the root workspace (server deps), client build, then a runtime stage that serves
as non-root `bun`.
