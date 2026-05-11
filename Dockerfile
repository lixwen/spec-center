# ---- Stage 1: Install & Build ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/

RUN npm install --ignore-scripts && npm config set registry https://registry.npmmirror.com

COPY tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY apps/web/ apps/web/

RUN npm run build --workspace @spec-center/core && \
    npm run build --workspace @spec-center/web

RUN npx tsup packages/core/src/worker-main.ts \
      --format cjs --out-dir dist-worker --no-dts \
      --external mongodb --external @qdrant/js-client-rest --external openai --external zod

# ---- Stage 2: Web production image ----
FROM node:22-alpine AS web

WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY docs/ docs/

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/server.js"]

# ---- Stage 3: Worker image ----
FROM node:22-alpine AS worker

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist/ ./packages/core/dist/
COPY --from=builder /app/dist-worker/worker-main.js ./worker-main.js

ENV NODE_ENV=production

CMD ["node", "worker-main.js"]
