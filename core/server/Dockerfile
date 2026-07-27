FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backsteros-packages/contracts backsteros-packages/contracts
COPY backsteros-api backsteros-api

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm --filter @backsteros/contracts build

WORKDIR /app/backsteros-api
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/backsteros-api
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "dist/index.js"]
