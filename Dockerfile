FROM node:24.22.2-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
FROM dependencies AS api-build
COPY apps/api ./apps/api
COPY database ./database
RUN npm run build --workspace=@mentoria/api

FROM dependencies AS web-build
COPY apps/web ./apps/web
RUN npm run build --workspace=@mentoria/web

FROM node:24.22.2-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api ./apps/api
COPY --from=api-build /app/database ./database
COPY --from=api-build /app/package*.json ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3333
CMD ["node", "apps/api/dist/main.js"]

FROM caddy:2.10.2-alpine AS frontend
COPY --from=web-build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
