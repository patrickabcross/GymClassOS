# syntax=docker/dockerfile:1.7

# GymClassOS Fly image — builds the two long-running services:
# services/edge-webhooks (Hono webhook receiver) and services/worker (pg-boss).
# staff-web ships to Vercel via `agent-native deploy --preset vercel` and is
# not part of this image.
# fly.toml [processes] selects which entrypoint runs.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
WORKDIR /repo

# ---- deps stage ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/edge-webhooks/package.json services/edge-webhooks/
COPY services/worker/package.json services/worker/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile \
    --filter "@gymos/edge-webhooks..." \
    --filter "@gymos/worker..."

# ---- build stage ----
FROM deps AS build
COPY services/edge-webhooks/ services/edge-webhooks/
COPY services/worker/ services/worker/
COPY packages/ packages/
RUN pnpm --filter @gymos/edge-webhooks build
RUN pnpm --filter @gymos/worker build

# ---- runtime stage ----
FROM base AS runtime
COPY --from=deps  /repo/node_modules /repo/node_modules
COPY --from=deps  /repo/services/edge-webhooks/node_modules /repo/services/edge-webhooks/node_modules
COPY --from=deps  /repo/services/worker/node_modules /repo/services/worker/node_modules
COPY --from=build /repo/services/edge-webhooks/dist /repo/services/edge-webhooks/dist
COPY --from=build /repo/services/worker/dist /repo/services/worker/dist
COPY --from=build /repo/packages /repo/packages
# fly.toml [processes] picks the entrypoint; default is web (edge-webhooks).
CMD ["node", "services/edge-webhooks/dist/index.js"]
