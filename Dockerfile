# ez standard Dockerfile, static variant: ezconv has no application backend,
# so the runtime is nginx-unprivileged (non-root, uid 101) serving the built
# files. Any static host can serve dist/ instead. Keep the Bun version in step
# with `bun-version` in .github/workflows.

# ---- build: frontend bundle ----
FROM oven/bun:1.4.5-alpine AS build
WORKDIR /app
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile
COPY client ./client
RUN cd client && bun run build

# ---- runtime ----
FROM nginxinc/nginx-unprivileged:stable-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="ezconv" \
	org.opencontainers.image.source="https://github.com/c4lyp5o/ezconv" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.version="$APP_VERSION"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:5000/" >/dev/null || exit 1
