# Build the frontend with Bun; no application runtime is shipped.
FROM oven/bun:1.4.4-alpine AS builder
WORKDIR /app
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile
COPY client ./client
RUN cd client && bun run build

# Optional static hosting container. Any static host can serve dist/ instead.
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 5000
