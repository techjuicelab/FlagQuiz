FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY docs/image-prompts ./docs/image-prompts
COPY js ./js
COPY data ./data
COPY flags ./flags
COPY images ./images
COPY assets ./assets
COPY audio ./audio
COPY css ./css
COPY index.html sw.js manifest.webmanifest ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/_site ./_site
COPY data/countries.js ./data/countries.js
COPY server ./server
ENV HOST=0.0.0.0 PORT=8090 STATE_DIR=/var/lib/flagquiz STATIC_ROOT=/app/_site
RUN mkdir -p /var/lib/flagquiz && chown node:node /var/lib/flagquiz
USER node
VOLUME ["/var/lib/flagquiz"]
EXPOSE 8090
CMD ["node", "server/auth-server.mjs"]
