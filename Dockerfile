# Check My Next Home — the app image (plan step M7.3).
#
# The served architecture: one Next codebase serving the
# pages and the API route handlers that call the brains.
# The play server (M7.3 integration) and production (M12)
# run this same image beside the PostGIS service in
# docker-compose.yml.
#
# The full build tree is copied into the runtime image on
# purpose: the brains' on-demand loads spawn the repo's
# loader scripts as child processes (the D23/D30 pattern),
# so the running server needs loaders/ and node_modules/,
# not just the Next build.
#
# NEXT_PUBLIC_ values inline at build time, so the
# Turnstile site key (K5) and the site environment (the
# TEST strip) arrive as build arguments — never as secrets
# baked into the repo.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG NEXT_PUBLIC_SITE_ENV="play"
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SITE_ENV=$NEXT_PUBLIC_SITE_ENV
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# BUG-170: the sample report is baked once per deploy
# before the server starts — generation reads the
# filed data through the real pipeline, so it cannot
# happen at image build (no database there). A failed
# bake never blocks the start: the serving seam falls
# back to live generation, the pre-fix behaviour.
CMD ["sh", "-c", "npx -y tsx scripts/bake-sample-report.ts || true; exec npm run start"]
