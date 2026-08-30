# syntax=docker/dockerfile:1.7
# Build context = ApoyoWeb or ApoyoAdmin repo root.
# extra context `nginx_conf` = deploy/nginx (spa.conf + headers.inc).

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY"
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache wget
COPY --from=nginx_conf spa.conf /etc/nginx/conf.d/default.conf
COPY --from=nginx_conf headers.inc /etc/nginx/headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
