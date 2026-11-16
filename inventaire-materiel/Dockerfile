# Image de l'application Parc IT : interface React compilée + serveur Node.js
# Construite et lancée par docker-compose.yml (avec la base PostgreSQL).

# ---------- 1. Compilation de l'interface ----------
FROM node:22-alpine AS interface
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- 2. Serveur ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY --from=interface /app/client/dist /app/client/dist
# Fichier Excel d'origine, pour « npm run import » dans le conteneur
COPY ["fichier excel", "/app/fichier excel"]

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/auth/etat >/dev/null || exit 1
CMD ["node", "src/index.js"]
