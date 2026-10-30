# ============================
# Stage 1: Builder
# ============================
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install backend deps
COPY package.json bun.lock ./
RUN bun install

# Copy client and build it
COPY client ./client
RUN cd client && bun install && bun run build

# ============================
# Stage 2: Production
# ============================
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install system deps
RUN apk add --no-cache tzdata curl
ENV TZ=Asia/Kuala_Lumpur

# Only install production deps for backend
COPY package.json bun.lock ./
RUN bun install --production

# Copy server
COPY server.js ./

# Copy built client bundle
COPY --from=builder /app/dist ./dist

# static server needs no privileges
USER bun

# inside the container the published port IS the boundary — bind all interfaces
ENV HOST=0.0.0.0

EXPOSE 5000

CMD ["bun", "start"]