# ShopLite frontend — production image
#
# Stage 1 builds the Vite bundle with Node; Stage 2 serves only static files with
# Nginx. The dev server (and node_modules) never reach the final image.

# ---------- Stage 1: build ----------
FROM node:24-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Public, build-time config only. Empty = same-origin requests through Nginx.
# Vite inlines VITE_* into the JS bundle, so never put secrets here.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:alpine AS runtime

# Replace the default site with the ShopLite config (SPA + API proxy).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets produced by Vite.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx image ships BusyBox wget, so no extra package is needed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
