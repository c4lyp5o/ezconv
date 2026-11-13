# ezconv frontend

React + Vite 8. All conversion and compression work runs locally in the browser;
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
