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
# --ignore-scripts: skip the repo-root postinstall, which builds framework
# packages (migrate/pinpoint/scheduling/dispatch) that are NOT part of this
# filtered install and would fail (their tsc isn't installed). We build exactly
# what the services need (core, queue, whatsapp) explicitly in the build stage.
# Nothing in the service graph needs a native postinstall (pg/pg-boss/hono are
# pure JS), so skipping install scripts is safe here.
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter "@gymos/edge-webhooks..." \
    --filter "@gymos/worker..."

# ---- build stage ----
FROM deps AS build
COPY services/edge-webhooks/ services/edge-webhooks/
COPY services/worker/ services/worker/
COPY packages/ packages/
# Build workspace deps to dist (plain tsc) BEFORE the services. edge-webhooks
# imports @agent-native/core; both services import @gymos/queue + @gymos/whatsapp.
RUN pnpm --filter @agent-native/core build
RUN pnpm --filter @gymos/whatsapp build
RUN pnpm --filter @gymos/queue build
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
