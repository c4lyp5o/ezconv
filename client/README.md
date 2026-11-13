# ezconv frontend

ezconv 2.0.0 uses React 19.3 + Vite 8. Build with Bun 1.4.4. All conversion and compression work runs locally in the browser;
there is no application backend.

From the repository root:

```bash
bun run install:all
bun run dev
bun run lint
bun run test
bun run build
bun run preview
```

The production output is the root `dist/` directory. Deploy it to a static host
at the domain root, or use the optional Nginx container. See
[README](../README.md) for deployment requirements and
[DEVELOPER](../DEVELOPER.md) for worker, PDF and build details.

For 1.x upgrades, release artifacts, known conversion limits and rollback, see
[the release guide](../RELEASE.md). The UI footer version is baked from this
package's version; release validation also checks the root package, changelog,
service worker cache and any CI release tag.
