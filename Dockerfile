FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json README.md .gitignore ./
COPY scripts ./scripts
COPY docs ./docs
COPY design ./design
COPY tests ./tests
COPY server ./server
COPY js ./js
COPY data ./data
COPY flags ./flags
COPY images ./images
COPY assets ./assets
COPY audio ./audio
COPY css ./css
COPY index.html sw.js manifest.webmanifest ./
RUN npm test && npm run build && npm run verify -- --strict

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/_site ./_site
COPY data/countries.js ./data/countries.js
COPY server ./server
COPY scripts/backup-private-state.mjs scripts/verify-private-state.mjs scripts/check-private-state.mjs scripts/check-private-config.mjs ./scripts/
ENV HOST=0.0.0.0 PORT=8090 STATE_DIR=/var/lib/flagquiz STATIC_ROOT=/app/_site
LABEL deployed-by=forgejo-actions
RUN mkdir -p /var/lib/flagquiz /var/backups/flagquiz \
    && chown node:node /var/lib/flagquiz /var/backups/flagquiz \
    && chmod 700 /var/lib/flagquiz /var/backups/flagquiz
USER node
VOLUME ["/var/lib/flagquiz"]
EXPOSE 8090
CMD ["node", "server/auth-server.mjs"]
