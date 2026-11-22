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

`test.yml` installs both lockfiles with Bun and runs release metadata validation, Biome, Vitest and Vite, uploads `dist/` as `ezconv-dist`, and builds, boots and health-checks the image. `publish.yml` runs it first, then publishes the GHCR static-host image from `master` (and on a `vX.Y.Z` tag, with the versioned ZIP from `scripts/release-assets.sh` attached to the GitHub Release).

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

## Commands

| Task | Command |
| --- | --- |
| Install every package | `bun run install:all` |
| Run the dev servers | `bun run dev` |
| Run the test suite | `bun run test` |
| Lint with Biome | `bun run lint` |
| Apply Biome's safe fixes | `bun run lint:fix` |
| Build | `bun run build` |

`bun run test` runs the Vitest suite in `client/`.

## Linting

[Biome](https://biomejs.dev) 2.6.8 is the only linter. It is pinned at the repo root, so run it from there: `bun run lint` checks, `bun run lint:fix` applies safe fixes. Configuration is `biome.json`; `biome.json` also sets the formatting rules (`bunx biome check --write .` applies them). CI runs the same command.

## Branches and releases

There are two long-lived branches:

| Branch | Role |
| --- | --- |
| `development` | Integration branch. Branch from it (`feat/…`, `fix/…`, `chore/…`) and open every PR against it. |
| `master` | Released code. Only `development` is merged into it, by PR. |

No other long-lived branches (`main`, `dev`, `staging`, …) are kept; delete feature branches once merged.

To release: bump the version in `package.json` and `client/package.json` (`bun run release:prepare`), move the `[Unreleased]` notes in `CHANGELOG.md` under `## [x.y.z] - YYYY-MM-DD`, then merge `development` into `master`. Every push to `master` runs `publish.yml`: `test.yml` first, then `ghcr.io/c4lyp5o/ezconv:<version>`, `:latest` and `:sha-<commit>`. Tagging `vX.Y.Z` afterwards is optional: it checks the tag matches `package.json`, pushes `:<version>` and creates a GitHub Release from that version's changelog section, with the files from `scripts/release-assets.sh` attached. `development` publishes nothing.

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`fix(scope): …`) with a body that explains why. Add a `CHANGELOG.md` line under `[Unreleased]` for anything a user would notice. Every behaviour change needs a test; a bug fix needs one that fails without the fix.

## Docker

The image follows the ez standard Dockerfile, static variant: a Bun stage builds the frontend, then `nginx-unprivileged` (uid 101) serves it with a `HEALTHCHECK` on `/`. Keep the Bun version in step with `bun-version` in `.github/workflows/`. `test.yml` builds the image, boots it and waits for healthy; do the same locally after changing the Dockerfile.

## Release

This prepares a release candidate. A local build or archive does not publish a
GitHub release, create a tag, push an image, or change a running deployment.
The release notes are maintained in [CHANGELOG.md](CHANGELOG.md#200---2026-11-13).

### What ships

- `dist/`: the complete frontend, deployed at a domain root. No API/backend,
  database, runtime `.env`, or Bun/Node process is needed in production.
- `release/2.0.0/ezconv-2.0.0-static.zip`: the same frontend files at the ZIP root.
- `SHA256SUMS`, `RELEASE_NOTES.md`, and `manifest.json` alongside the ZIP. The
  manifest records the source commit, app version, file count and archive hash.
- Optional GHCR image: unprivileged Nginx serving the same frontend on port 5000.

The static archive includes the service worker, manifest, icons, fonts, FFmpeg
core/wasm, and PDF.js worker/fonts/maps/decoders. It contains no source checkout,
backend, local environment file or `node_modules`.

### Migration from 1.x

| Previous setup                       | 2.0.0 replacement                                                     |
| ------------------------------------ | --------------------------------------------------------------------- |
| Bun static server / `server.js`      | Deploy the built `dist/` files or use the Nginx image                 |
| `bun start` in production            | A static host; `bun run preview` is only a local preview              |
| `dev:server` / port 5000 API         | Removed: there was no application API                                 |
| `install:server`, `install:client`   | `bun run install:all` installs root tooling and frontend dependencies |
| `dev:client` / combined dev process  | `bun run dev` starts only Vite on port 3000                           |
| `build-client`, `build:all`          | `bun run build` writes root `dist/`                                   |
| Runtime `HOST`, `PORT`, `TZ`, `.env` | Unused; configure the static host or published container port instead |
| Container/reverse proxy port 5000    | Unchanged; Compose uses `EZCONV_PORT` for the host port               |

Build with Bun 1.4.4 and the committed lockfiles. There is no user/server database
migration. Existing browser-saved theme settings remain local; new custom
recipes store only settings on that browser/origin.

### Prepare locally

1. Review and commit all changes on the intended release commit. The repository
   must be clean; generated `dist/` and `release/` are ignored by Git.
2. Run the Bun-only release gate:

   ```bash
   bun run release:prepare
   ```

   This checks metadata, installs both frozen lockfiles, runs lint/tests/build,
   then produces the ZIP, checksum, notes and manifest. It does not publish.
3. Verify the generated ZIP against `SHA256SUMS` and inspect `manifest.json`.
   Extract the ZIP into an empty staging directory and serve it as static files.
   `bun run preview` can preview the equivalent local `dist/` build.
4. Build the optional deployment container when it is part of your rollout:

   ```bash
   docker build -t ezconv:2.0.0 .
   docker run --rm -p 127.0.0.1:5000:5000 ezconv:2.0.0
   ```

`bun run release:validate` checks version metadata only. CI uses
`bun scripts/release.mjs --package-only` after its existing lint/test/build gate;
that shortcut does not rerun tests and should not replace the local release gate.

### Acceptance checks

Before publishing, verify the candidate on the actual intended host:

- UI footer displays `v2.0.0`; no request goes to a conversion API or third party.
- Picture conversion/compression and crop/rotate produce readable outputs;
  target size failures are reported instead of being presented as guaranteed.
- PDF merge/split/extract/reorder and PNG/JPEG page ZIPs preserve the expected
  pages/order. Text/Markdown and YAML/JSONL/TSV conversions produce readable files.
- Video audio extraction/trimming, GIF and animated WebP output work; a corrupt
  media job reports failure after a successful job, without returning stale data.
- ZIP preview/extraction and selected queue additions work; duplicate output
  names remain separate in a downloaded batch ZIP.
- Built-in and saved recipes apply, and saved settings survive reload.
- Mobile controls fit the viewport. Downloads and keyboard/paste work on the
  supported browser/device you intend to use.
- After warming each relevant feature online, reload offline and repeat it.
  On a 1.x browser profile, update online first and confirm the new footer.

The automated suite covers the data/worker/page/ZIP/size/sanitization logic.
Browser/media codec support and deployment headers also need browser checks;
the unit suite alone does not verify every encoder or browser.

### Hosting requirements

Serve the entire output at `/`, using HTTPS (localhost is also a secure context
for development). Basic conversion also works on HTTP LAN addresses using local
job-ID fallbacks; PWA/clipboard features still need a secure context. `.js` and `.mjs` need JavaScript MIME types; `.wasm` needs
`application/wasm`. Missing assets must return 404 rather than HTML.

Use immutable caching only for hashed `/assets/` paths. Revalidate HTML, `sw.js`,
manifest and `/pdf/` support files. `nginx.conf` implements this, including the
explicit `.mjs` MIME mapping. Deploy files together so HTML and referenced
assets match; preserve older hashed assets when your host supports rolling
clients. Reload open tabs online after an upgrade before relying on offline use.
The 2.0.0 service worker uses `ezconv-v2.0.0`; older caches remain available to
open tabs/offline fallback. It does not precache every lazily loaded feature.

### Known conversion limits

- File size budgets apply to picture/PDF compression and are best effort. The
  quality floor is an encoder setting, not a guarantee of visual similarity;
  dimensions/DPI may decrease. PNG quality is not controlled by that setting.
- Best effort PDF compression retains document content. Stronger presets can
  rebuild pages as images and remove selectable text, links, forms and tags.
  Merge copies pages without document-level bookmarks/forms. Re-saving PDFs
  invalidates signatures; encrypted/password-protected PDFs are unsupported.
- Markdown/text PDFs are rendered pages with basic formatting and Unicode font
  fallback. Their text is not selectable. Markdown HTML is sanitized; external
  images and active content are omitted. SVG exports are rasterized locally.
- GIF picture conversion flattens animation; use video/animated WebP targets
  to preserve it. Animation exports run at 12 fps. Long/high-resolution media
  may exceed browser memory; trim/downscale large inputs.
- Text exports from multi-sheet workbooks carry only the first sheet, with a
  warning. XLSX output retains all sheets. Tabular targets require objects/rows.
- ZIP limits are 80 MB input/per file, 200 MB expanded total and 200 entries.
  Unsupported files can be extracted individually; nested ZIPs are not queued
  automatically. Browser download policies may require a user click.
- Offline use needs the shell and relevant feature assets to have been fetched
  online first. Browser cache eviction can make a feature require network again.

### Publish and deploy (separate operator action)

1. Merge the reviewed changes into the chosen production branch (`main` or
   `master`), check out its final clean commit and rerun `bun run release:prepare`.
   The artifact manifest must identify that final commit.
2. Create the annotated `v2.0.0` tag on that commit and push it when authorized.
   CI rejects a tag that does not match the package version. Confirm CI is green.
3. Publish the versioned static ZIP, checksum, notes and manifest with the release,
   or deploy the full static artifact to your host. CI uploads `ezconv-dist` and
   `ezconv-release`; it does not automatically create a GitHub release.
4. For containers, CI publishes `ghcr.io/c4lyp5o/ezconv:v2.0.0` for the release
   tag and a commit-specific tag. Production branch pushes also update their
   branch tag and `latest`; a version tag alone does not update `latest`.
   Prefer a version tag or digest for a controlled deployment.
5. Repeat the host acceptance checks and retain the previous artifact/image.

### Rollback

Redeploy the complete previous static artifact or pin the previous container
version/digest; keep the same public origin and container port as applicable.
There is no backend data to roll back. Reload online and verify the expected
footer and conversion behavior. Clear site caches only if needed to recover a
stale shell; clearing all site data also deletes locally saved recipes/theme.
