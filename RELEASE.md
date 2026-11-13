# Release guide — ezconv 2.0.0

This prepares a release candidate. A local build or archive does not publish a
GitHub release, create a tag, push an image, or change a running deployment.
The release notes are maintained in [CHANGELOG.md](CHANGELOG.md#200---2026-11-13).

## What ships

- `dist/`: the complete frontend, deployed at a domain root. No API/backend,
  database, runtime `.env`, or Bun/Node process is needed in production.
- `release/2.0.0/ezconv-2.0.0-static.zip`: the same frontend files at the ZIP root.
- `SHA256SUMS`, `RELEASE_NOTES.md`, and `manifest.json` alongside the ZIP. The
  manifest records the source commit, app version, file count and archive hash.
- Optional GHCR image: unprivileged Nginx serving the same frontend on port 5000.

The static archive includes the service worker, manifest, icons, fonts, FFmpeg
core/wasm, and PDF.js worker/fonts/maps/decoders. It contains no source checkout,
backend, local environment file or `node_modules`.

## Migration from 1.x

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

## Prepare locally

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

## Acceptance checks

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

## Hosting requirements

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

## Known conversion limits

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

## Publish and deploy (separate operator action)

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

## Rollback

Redeploy the complete previous static artifact or pin the previous container
version/digest; keep the same public origin and container port as applicable.
There is no backend data to roll back. Reload online and verify the expected
footer and conversion behavior. Clear site caches only if needed to recover a
stale shell; clearing all site data also deletes locally saved recipes/theme.
