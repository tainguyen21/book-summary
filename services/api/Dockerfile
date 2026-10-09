FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY services/api services/api
RUN pnpm --dir services/api build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=dependencies /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/services/api ./services/api

EXPOSE 3001
USER 1000
CMD ["node", "services/api/dist/main.js"]
