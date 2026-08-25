# cloud-core production image — multi-stage build with BuildKit SSH for git deps.
# Build: DOCKER_BUILDKIT=1 docker buildx build --platform linux/amd64 --ssh default -f deploy/cloud/Dockerfile -t backsteros-cloud:latest --load .
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git openssh-client
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY core/packages/contracts ./core/packages/contracts
COPY core/server ./core/server

RUN mkdir -p -m 0700 /root/.ssh && ssh-keyscan github.com >> /root/.ssh/known_hosts
RUN --mount=type=ssh pnpm install --frozen-lockfile --filter @backsteros/server...
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
