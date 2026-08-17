#!/bin/bash
# Script de déploiement ERP AGEROUTE - exécuté sur le serveur 102.211.199.131
#
# ⚠️ §3.1 AGENTS.md : JAMAIS `prisma db push` (surtout pas --accept-data-loss) —
# il détruit les tables hors schéma Prisma (bpmn_*, ref_*). Le schéma évolue
# exclusivement via les fichiers SQL de backend/prisma/sql/, appliqués par psql,
# après sauvegarde pg_dump. C'est la violation de cette règle qui a détruit
# l'historique BPMN constaté dans la REVUE-2026-08-13.

set -e

ERP_DIR="/opt/erp-ageroute"

echo "=== Arrêt et suppression d'ERPNext (/opt/erpnext) ==="
cd /opt/erpnext 2>/dev/null && docker compose down --remove-orphans 2>/dev/null || true
# Libère les volumes ERPNext (données non conservées — confirmé)
docker volume ls -q 2>/dev/null | grep -i erpnext | xargs -r docker volume rm 2>/dev/null || true

echo "=== Création du répertoire ERP ==="
mkdir -p "$ERP_DIR"
cd "$ERP_DIR"

echo "=== Chargement des secrets (.env requis — voir .env.example) ==="
set -a; . ./.env; set +a

echo "=== Extraction de l'archive ==="
tar -xzf /tmp/erp-ageroute.tar.gz -C "$ERP_DIR"

echo "=== Build et démarrage ==="
docker compose build --no-cache
docker compose up -d

echo "=== Sauvegarde de sécurité de la base (préalable à toute opération de schéma) ==="
docker compose exec -T erp-db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
  > "backup-pre-migration-$(date +%Y%m%d-%H%M%S).dump"

echo "=== Application des migrations SQL manuelles (§3.1 — jamais db push) ==="
sleep 5
for f in "$ERP_DIR"/backend/prisma/sql/*.sql; do
  [ -e "$f" ] || continue
  echo "-- application de $(basename "$f")"
  docker compose exec -T erp-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 < "$f"
done

echo "=== Seed (admin, workflows BM/BAD/Budget/FER) ==="
docker compose exec -T erp-backend node dist/lib/seed.js

echo "=== Vérification ==="
sleep 5
docker compose ps
curl -sf http://localhost:4001/api/health && echo "Backend OK" || echo "Backend KO"

echo "=== Déploiement terminé ==="
echo "ERP disponible sur https://gestion.ageroute.gov.gn"
