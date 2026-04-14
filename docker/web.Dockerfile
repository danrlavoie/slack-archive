# syntax=docker/dockerfile:1

# --- builder stage ---
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY archive/package.json archive/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN pnpm install --frozen-lockfile

COPY packages/types packages/types
COPY backend backend
COPY frontend frontend

RUN pnpm --filter @slack-archive/types build \
 && pnpm --filter slack-archive-backend build \
 && pnpm --filter frontend build

# --- runtime stage ---
FROM node:22-slim
RUN corepack enable
WORKDIR /app

COPY --from=builder /build/pnpm-workspace.yaml /build/pnpm-lock.yaml /build/package.json ./
COPY --from=builder /build/packages/types/package.json packages/types/package.json
COPY --from=builder /build/packages/types/dist packages/types/dist
COPY --from=builder /build/backend/package.json backend/package.json
COPY --from=builder /build/backend/dist backend/dist
COPY --from=builder /build/frontend/package.json frontend/package.json
COPY --from=builder /build/frontend/dist frontend/dist

# archive manifest needed so pnpm can resolve the full workspace.
COPY --from=builder /build/archive/package.json archive/package.json

RUN pnpm install --frozen-lockfile --prod --filter slack-archive-backend...

EXPOSE 3100
ENV NODE_ENV=production
CMD ["node", "backend/dist/server.js"]
