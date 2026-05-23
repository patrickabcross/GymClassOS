# syntax=docker/dockerfile:1.7

# GymClassOS Fly image — builds apps/edge-webhooks, apps/worker, AND apps/staff-web.
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
# Install deps for all three apps. staff-web pulls in the React Router /
# Vite / agent-native build chain; the postinstall hook builds
# @agent-native/core + migrate + scheduling + dispatch which staff-web depends on.
RUN pnpm install --frozen-lockfile \
    --filter "@gymos/edge-webhooks..." \
    --filter "@gymos/worker..." \
    --filter "@gymos/staff-web..."

# ---- build stage: compile TS / run agent-native build ----
FROM deps AS build
COPY apps/edge-webhooks/ apps/edge-webhooks/
COPY apps/worker/ apps/worker/
COPY apps/staff-web/ apps/staff-web/
COPY packages/ packages/
RUN pnpm --filter @gymos/edge-webhooks build
RUN pnpm --filter @gymos/worker build
# agent-native build runs `react-router build` then the deploy/build.js Nitro
# step. With NITRO_PRESET unset, Nitro emits a normal Node server at
# apps/staff-web/.output/server/index.mjs — no serverless bundling, no
# class-extends bug. Run from inside the staff-web dir so the build script's
# cwd-relative paths (build/, .output/) land correctly.
RUN cd apps/staff-web && pnpm exec agent-native build

# ---- runtime stage ----
FROM base AS runtime
COPY --from=deps  /repo/node_modules /repo/node_modules
COPY --from=deps  /repo/apps/edge-webhooks/node_modules /repo/apps/edge-webhooks/node_modules
COPY --from=deps  /repo/apps/worker/node_modules /repo/apps/worker/node_modules
COPY --from=deps  /repo/apps/staff-web/node_modules /repo/apps/staff-web/node_modules
COPY --from=build /repo/apps/edge-webhooks/dist /repo/apps/edge-webhooks/dist
COPY --from=build /repo/apps/worker/dist /repo/apps/worker/dist
COPY --from=build /repo/apps/staff-web/.output /repo/apps/staff-web/.output
COPY --from=build /repo/apps/staff-web/build /repo/apps/staff-web/build
COPY --from=build /repo/apps/staff-web/server/db /repo/apps/staff-web/server/db
COPY --from=build /repo/packages /repo/packages
# fly.toml [processes] picks the entrypoint; default is web (edge-webhooks).
CMD ["node", "apps/edge-webhooks/dist/index.js"]
