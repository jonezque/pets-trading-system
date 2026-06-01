# Bun runtime image for the Pets Trading System backend.
FROM oven/bun:1.3.11-alpine AS base
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN bun install

# Copy application source.
COPY tsconfig.json ./
COPY src ./src

ENV PORT=3000
EXPOSE 3000

# Migrations + seed run on startup (idempotent), then the server boots.
CMD ["bun", "src/index.ts"]
