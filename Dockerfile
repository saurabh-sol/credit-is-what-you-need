# syntax=docker/dockerfile:1

# The wallet SDKs pull in two small native modules (bufferutil, utf-8-validate)
# with no prebuilt binary for this Node version, so this stage alone carries a
# compiler. Nothing of it reaches the runtime image.
FROM node:24-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are written into the browser bundle at build time, so
# they are build arguments, not runtime environment variables.
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ARG NEXT_PUBLIC_RPC_MAINNET=
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_RPC_MAINNET=$NEXT_PUBLIC_RPC_MAINNET
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id; the server must listen on all
# interfaces to be reachable through the published port.
ENV HOSTNAME=0.0.0.0
# DATABASE_URL (Neon Postgres) comes from the environment at run time.

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
VOLUME /app/data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
