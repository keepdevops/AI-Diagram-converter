# Multi-stage: build the Vite SPA, then serve the static bundle with nginx.
# Build context is the repo root.

# --- build stage ---------------------------------------------------------
# Vite 8 (Rolldown) requires Node ^20.19 || >=22.12; use the 22 LTS line.
FROM node:22-alpine AS build
WORKDIR /app

# Install deps from the lockfile first for layer caching.
COPY web-react/package.json web-react/package-lock.json ./
RUN npm ci

COPY web-react/ ./

# Same-origin default ('/plantuml') lives in App.jsx; override here if needed.
ARG VITE_PLANTUML_SERVER
ENV VITE_PLANTUML_SERVER=${VITE_PLANTUML_SERVER}
RUN npm run build

# --- serve stage ---------------------------------------------------------
FROM nginx:alpine

# envsubst only touches RENDER_PROXY_PASS; nginx's own $uri/$host stay intact.
ENV NGINX_ENVSUBST_FILTER=RENDER_PROXY_PASS \
    RENDER_PROXY_PASS=http://render:8080/

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# busybox wget ships in nginx:alpine.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:80/ || exit 1
