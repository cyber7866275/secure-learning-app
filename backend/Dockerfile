# Production image for the SecureLearn backend API.
# Used by Render (Docker web service) and any other container host.
# Includes ffmpeg (video/HLS worker) and openssl (Prisma).




FROM node:20-bookworm-slim AS builder




RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*




WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY prisma ./prisma
COPY tsconfig*.json nest-cli.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build
# Pre-compile the seed script so the runtime can run it with plain node
# (avoids npx tsx download flakiness at container startup).
RUN npx tsc prisma/seed.ts --outDir seed-dist --module commonjs --target es2021 --esModuleInterop --skipLibCheck --moduleResolution node




# ---- Runtime ----
FROM node:20-bookworm-slim




RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates ffmpeg python3 make g++ \
 && rm -rf /var/lib/apt/lists/*




WORKDIR /app
ENV NODE_ENV=production




COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY prisma.config.ts ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/seed-dist ./seed-dist




# Render (and most hosts) inject PORT. The app reads process.env.PORT.
EXPOSE 3000




# Sync schema, then start. (The one-off owner-admin seed ran on 2026-09-26 and
# is intentionally NOT part of startup anymore.)
CMD ["sh", "-c", "npx -y prisma@7.10.0 db push --accept-data-loss && node dist/main"]

