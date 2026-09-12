# cloud-core production image — multi-stage build.
# Build: ./deploy/cloud/build-image.sh
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY patches ./patches
COPY core/packages/contracts ./core/packages/contracts
COPY core/server ./core/server

# Skip postinstall (totem compile) — cloud-core does not need Whoop dist for API/replication.
# Large optional peers (e.g. op-sqlite via drizzle) often time out on flaky npm; give them room.
RUN pnpm config set fetch-timeout 600000 \
  && pnpm config set fetch-retries 5 \
  && pnpm config set network-concurrency 4 \
  && pnpm install --frozen-lockfile --filter @backsteros/server... --ignore-scripts
RUN pnpm --filter @backsteros/contracts build
RUN pnpm --filter @backsteros/server build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=build /app /app

WORKDIR /app/core/server
ENV NODE_ENV=production
ENV PORT=8788
EXPOSE 8788

CMD ["node", "dist/index.js"]
