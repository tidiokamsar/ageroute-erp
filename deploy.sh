#!/bin/bash
# Script de déploiement ERP AGEROUTE - exécuté sur le serveur 102.211.199.131

set -e

ERP_DIR="/opt/erp-ageroute"

echo "=== Arrêt et suppression d'ERPNext (/opt/erpnext) ==="
cd /opt/erpnext 2>/dev/null && docker compose down --remove-orphans 2>/dev/null || true
# Libère les volumes ERPNext (données non conservées — confirmé)
docker volume ls -q 2>/dev/null | grep -i erpnext | xargs -r docker volume rm 2>/dev/null || true

echo "=== Création du répertoire ERP ==="
mkdir -p "$ERP_DIR"
cd "$ERP_DIR"

echo "=== Extraction de l'archive ==="
tar -xzf /tmp/erp-ageroute.tar.gz -C "$ERP_DIR"

echo "=== Build et démarrage ==="
docker compose build --no-cache
docker compose up -d

echo "=== Synchronisation du schéma base de données ==="
sleep 10
# Pas d'historique de migrations : on synchronise le schéma directement (déploiement neuf).
docker compose exec -T erp-backend npx prisma db push --accept-data-loss
echo "=== Seed (admin, workflows BM/BAD/Budget/FER) ==="
docker compose exec -T erp-backend node dist/lib/seed.js

echo "=== Vérification ==="
sleep 5
docker compose ps
curl -sf http://localhost:4001/api/health && echo "Backend OK" || echo "Backend KO"

echo "=== Déploiement terminé ==="
echo "ERP disponible sur https://gestion.ageroute.gov.gn"
