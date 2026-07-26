# Builds one app from the monorepo. Pass APP (acme-telecom | globex-marketing).
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

ARG APP
# NEXT_PUBLIC_* must be present at build time (Next bakes it in). Only Globex uses it.
ARG NEXT_PUBLIC_ACME_URL=""
ENV NEXT_PUBLIC_ACME_URL=$NEXT_PUBLIC_ACME_URL
RUN pnpm --filter "@ail/${APP}" build

ENV NODE_ENV=production
ENV APP=$APP
# Each app's start script binds its own port (acme 3001, globex 3002).
CMD ["sh", "-c", "exec pnpm --filter @ail/${APP} start"]
