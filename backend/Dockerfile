FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY assets ./assets
RUN npx prisma generate
COPY tsconfig.json .
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY assets ./assets
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch(\"http://127.0.0.1:4001/api/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Plus aucun .env dans l'image — revue du 22/08/2026. `COPY .env* ./` embarquait
# tout fichier de secrets présent dans le contexte de build, et la commande de
# démarrage le sourçait. En production rien n'était copié (le .env vit à la
# racine du projet, hors contexte), mais un .env local oublié dans backend/
# aurait fini dans une image poussée ou archivée. La configuration vient
# EXCLUSIVEMENT de l'environnement injecté par docker-compose (cf. le bloc
# `environment` du service erp-backend). Le .dockerignore verrouille en plus.
CMD ["node", "dist/server.js"]
