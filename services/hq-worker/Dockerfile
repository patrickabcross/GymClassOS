# syntax=docker/dockerfile:1.7

# GymClassOS hq-worker Fly image
# Boots pg-boss against the HQ Neon and serves /healthz.
#
# D-12: flyctl is baked into the runtime stage at a PINNED version because
# Fly secrets CANNOT be set via the Machines REST API (that path is restricted
# to Fly KMS, not GA as of 2026-06). BD2 PROV shells out to flyctl via execa
# to run `flyctl secrets set` on newly-provisioned studio apps. Doing it here
# means BD2 adds jobs, not infrastructure.
#
# The image is separate from the root Dockerfile (services/edge-webhooks +
# services/worker) to isolate the flyctl install from the studio services.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
WORKDIR /repo

# ---- deps stage ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/hq-worker/package.json services/hq-worker/
COPY packages/ packages/
# --ignore-scripts: skip the repo-root postinstall which builds framework
# packages not needed here. Nothing in the hq-worker graph needs a native
# postinstall (pg/pg-boss/hono are pure JS).
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter "@gymos/hq-worker..."

# ---- build stage ----
FROM deps AS build
COPY services/hq-worker/ services/hq-worker/
COPY packages/ packages/
# Build workspace deps to dist before the service.
RUN pnpm --filter @gymos/queue build
RUN pnpm --filter @gymos/hq-worker build

# ---- runtime stage ----
FROM base AS runtime

# D-12: Install flyctl at a PINNED version so BD2 PROV can shell out to
# `flyctl secrets set` without reshaping the image at deploy time.
# Fly secrets cannot be set via the Machines REST API — flyctl CLI is the
# only working path (see .planning/phases/BD1-hq-foundation/BD1-CONTEXT.md
# decision D-12 and .planning/research/PITFALLS.md).
ARG FLYCTL_VERSION=0.3.96
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -L "https://github.com/superfly/flyctl/releases/download/v${FLYCTL_VERSION}/flyctl_${FLYCTL_VERSION}_Linux_x86_64.tar.gz" \
       -o /tmp/flyctl.tar.gz \
    && tar -xzf /tmp/flyctl.tar.gz -C /usr/local/bin flyctl \
    && rm /tmp/flyctl.tar.gz \
    && flyctl version \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps  /repo/node_modules /repo/node_modules
COPY --from=deps  /repo/services/hq-worker/node_modules /repo/services/hq-worker/node_modules
COPY --from=build /repo/services/hq-worker/dist /repo/services/hq-worker/dist
COPY --from=build /repo/packages /repo/packages

# hq-worker is a single-process app (no web + worker split like edge-webhooks).
# It binds /healthz on PORT 3003.
CMD ["node", "services/hq-worker/dist/index.js"]
