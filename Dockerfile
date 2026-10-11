# Production image: one container serves the built client and the API from the
# same origin. Built from the repo root so shared/contracts ships in the image.
# (docker-compose.yml keeps using server/ and client/ Dockerfiles for local dev.)

# ── Client build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json client/.npmrc ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Server build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS server
WORKDIR /app/server
COPY server/package*.json server/.npmrc ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY shared/ ./shared/
COPY --from=server /app/server/package.json ./server/
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/dist ./server/dist
COPY --from=client /app/client/dist ./client/dist
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
WORKDIR /app/server
# Runs as root: Fly mounts volumes root-owned, and DATA_DIR must be writable.
EXPOSE 3000
CMD ["node", "dist/server.js"]
