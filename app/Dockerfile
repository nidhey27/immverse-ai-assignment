# ---- Build Stage ----
# Use slim image to reduce attack surface
FROM node:18-alpine AS builder

WORKDIR /app

# Copy only package files first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# ---- Runtime Stage ----
FROM node:18-alpine

WORKDIR /app

# Run as non-root for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

# Healthcheck so Docker/Kubernetes knows when the container is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "app.js"]
