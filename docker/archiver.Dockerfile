# syntax=docker/dockerfile:1

# --- builder stage ---
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /build

# Copy workspace manifests first for cache-friendly install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY archive/package.json archive/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN pnpm install --frozen-lockfile

# Now copy source — cached install layer above stays warm during iteration.
COPY packages/types packages/types
COPY archive archive

RUN pnpm --filter @slack-archive/types build \
 && pnpm --filter @slack-archive/archiver build

# --- runtime stage ---
FROM node:22-slim
RUN corepack enable
WORKDIR /app

# Copy workspace manifests + lockfile so pnpm can do a prod-only install.
COPY --from=builder /build/pnpm-workspace.yaml /build/pnpm-lock.yaml /build/package.json ./
COPY --from=builder /build/packages/types/package.json packages/types/package.json
COPY --from=builder /build/packages/types/dist packages/types/dist
COPY --from=builder /build/archive/package.json archive/package.json
COPY --from=builder /build/archive/dist archive/dist

# Backend and frontend manifests are needed so pnpm can resolve the workspace,
# but we only install archiver's prod deps via the --filter flag.
COPY --from=builder /build/backend/package.json backend/package.json
COPY --from=builder /build/frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --prod --filter @slack-archive/archiver...

# archive's config.ts uses process.cwd() as BASE_DIR. WORKDIR /app means
# OUT_DIR resolves to /app/slack-archive, which matches the bind mounts.
WORKDIR /app

ENTRYPOINT ["node", "archive/dist/cli.js"]
CMD []
