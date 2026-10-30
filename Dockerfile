# ---- deps: install with lockfile for reproducible builds ----
FROM node:22-alpine AS deps
WORKDIR /app
# Skip telemetry in CI/docker builds
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile Next.js (standalone output) ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Skip telemetry in CI/docker builds
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal production image (non-root) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone server + static assets (requires `output: "standalone"` in next.config.ts)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Simple TCP check; /api/quote needs network, so keep healthcheck on root
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# Next's standalone server binds to $HOSTNAME when that variable is set, and Node
# resolves it before listening. Two failure modes follow:
#   * a platform-injected HOSTNAME (Coolify, Kubernetes) is often the container
#     name, which does not resolve inside the container -> the server dies with
#     "getaddrinfo ENOTFOUND" before it ever listens;
#   * an IPv4-only bind (0.0.0.0) makes "http://localhost:3000" fail on Alpine,
#     where localhost resolves to ::1 first — Coolify health-checks exactly that.
# Binding :: gives a dual-stack listener that accepts both families, so pin it at
# exec time where an injected value cannot win.
CMD ["sh", "-c", "exec env HOSTNAME='::' node server.js"]
