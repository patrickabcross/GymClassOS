# syntax=docker/dockerfile:1.7

# GymOS Fly image — builds BOTH apps/edge-webhooks AND apps/worker.
# fly.toml [processes] selects which entrypoint runs.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
WORKDIR /repo

# ---- deps stage: install workspace deps ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/edge-webhooks/package.json apps/edge-webhooks/
COPY apps/worker/package.json apps/worker/
COPY apps/staff-web/package.json apps/staff-web/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile \
    --filter "@gymos/edge-webhooks..." \
    --filter "@gymos/worker..." \
    --ignore-scripts

# ---- build stage: compile TS ----
FROM deps AS build
COPY apps/edge-webhooks/ apps/edge-webhooks/
COPY apps/worker/ apps/worker/
COPY apps/staff-web/server/db/ apps/staff-web/server/db/
COPY packages/ packages/
RUN pnpm --filter @gymos/edge-webhooks build
RUN pnpm --filter @gymos/worker build

# ---- runtime stage ----
FROM base AS runtime
COPY --from=deps  /repo/node_modules /repo/node_modules
COPY --from=deps  /repo/apps/edge-webhooks/node_modules /repo/apps/edge-webhooks/node_modules
COPY --from=deps  /repo/apps/worker/node_modules /repo/apps/worker/node_modules
COPY --from=build /repo/apps/edge-webhooks/dist /repo/apps/edge-webhooks/dist
COPY --from=build /repo/apps/worker/dist /repo/apps/worker/dist
COPY --from=build /repo/apps/staff-web/server/db /repo/apps/staff-web/server/db
COPY --from=build /repo/packages /repo/packages
# fly.toml [processes] picks the entrypoint; default is web.
CMD ["node", "apps/edge-webhooks/dist/index.js"]
