FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
# GitHub deps (e.g. @briangaoo/totem) need git; force HTTPS so builds need no SSH key.
RUN apk add --no-cache git \
 && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
 && git config --global url."https://github.com/".insteadOf "git@github.com:"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backsteros-app/package.json backsteros-app/package.json
COPY backsteros-packages/contracts/package.json backsteros-packages/contracts/package.json
COPY backsteros-packages/api-client/package.json backsteros-packages/api-client/package.json
# Ignore scripts until app sources (build-totem) are copied in the builder stage.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
COPY backsteros-app backsteros-app
COPY backsteros-packages backsteros-packages
RUN pnpm --filter @backsteros/contracts build \
 && pnpm --filter @backsteros/api-client build \
 && CLERK_SECRET_KEY=sk_build_placeholder pnpm --filter @backsteros/app build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/backsteros-app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/backsteros-app/.next/static ./backsteros-app/.next/static
# Standalone output does not always include public/; PDF.js workers live here.
COPY --from=builder --chown=nextjs:nodejs /app/backsteros-app/public ./backsteros-app/public
USER nextjs
EXPOSE 3000
CMD ["node", "backsteros-app/server.js"]
