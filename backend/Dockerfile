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


# Render (and most hosts) inject PORT. The app reads process.env.PORT.
EXPOSE 3000


# Run pending migrations, then start. Seeding is a one-off manual step
# (see README) so it is intentionally NOT run here.
CMD ["sh", "-c", "npx -y prisma@7.10.0 db push --accept-data-loss && npx -y tsx prisma/seed.ts && node dist/main"]

