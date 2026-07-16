FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backsteros-packages/contracts/package.json backsteros-packages/contracts/
COPY backsteros-api/package.json backsteros-api/

RUN pnpm install --frozen-lockfile

COPY backsteros-packages/contracts backsteros-packages/contracts
COPY backsteros-api backsteros-api

WORKDIR /app/backsteros-api
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backsteros-packages/contracts/package.json backsteros-packages/contracts/
COPY backsteros-api/package.json backsteros-api/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/backsteros-packages/contracts backsteros-packages/contracts
COPY --from=build /app/backsteros-api/dist backsteros-api/dist
COPY --from=build /app/backsteros-api/drizzle backsteros-api/drizzle

WORKDIR /app/backsteros-api
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "dist/index.js"]
