# Frontend Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Build stage
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configurations
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Setup nginx to run as non-root user
# Create cache and log directories with correct permissions
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
             /var/log/nginx \
             /var/run && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    chown -R nginx:nginx /etc/nginx/nginx.conf && \
    # Create PID file with correct permissions
    touch /tmp/nginx.pid && \
    chown nginx:nginx /tmp/nginx.pid && \
    # Allow nginx user to write to /var/run
    chmod 755 /var/run && \
    chown nginx:nginx /var/run

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 8080

# Health check (use 127.0.0.1 explicitly for IPv4)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

# Start nginx (pid is set in nginx-main.conf)
CMD ["nginx", "-g", "daemon off;"]
