FROM oven/bun:1.4.0 AS builder
WORKDIR /app
ENV HUSKY=0 TURBO_TELEMETRY_DISABLED=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1.4.0 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 3000

WORKDIR /app/apps/server
USER bun
CMD ["bun", "dist/index.mjs"]
