# Hermes web UI: builds the app, then serves it with Caddy, which also
# forwards the Hermes dashboard's routes so the browser sees one origin.
#
#   docker build -t hermes-web-ui .
#   docker run -d --network host -e HERMES_DASHBOARD_URL=http://127.0.0.1:9119 hermes-web-ui

FROM node:24-bookworm-slim AS build
WORKDIR /src
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Packages first, so a code change doesn't redo the install.
COPY package.json package-lock.json .npmrc ./
COPY apps/desktop/package.json apps/desktop/
COPY apps/shared/package.json apps/shared/
RUN npx -y npm@11 ci --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /src/desktop-web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

# Where the Hermes dashboard (`hermes dashboard`) listens, as seen from this container.
ENV HERMES_DASHBOARD_URL=http://127.0.0.1:9119
# The port this container serves the web UI on.
ENV PORT=8080
EXPOSE 8080
