#!/bin/bash
# Sauvegarde cohérente de l'ERP AGEROUTE : base PostgreSQL + volume des pièces.
#
# Constat de la revue du 22/08/2026 : l'ancien deploy.sh ne sauvegardait que
# PostgreSQL. Les pièces jointes (contrats, PV, photos, pièces de décompte)
# vivent dans le volume erp-ageroute_erp_uploads — sa perte est irréversible et
# aucune copie n'en était faite. Une base restaurée sans ses fichiers est un
# dossier de décompte qui renvoie à des pièces qui n'existent plus.
#
# Usage, sur le serveur (.131), en tant qu'agergec :
#   ~/sauvegarde.sh            -> /home/agergec/sauvegardes/AAAAMMJJ-HHMM/
# Rétention : 14 jours. Copier régulièrement le dossier HORS du serveur.
#
# Règle : toute commande qui échoue arrête le script (set -e). Une sauvegarde
# partielle qui se dit complète est pire qu'une absence de sauvegarde.
set -euo pipefail

RACINE="${SAUVEGARDE_DIR:-/home/agergec/sauvegardes}"
HORODATAGE="$(date +%Y%m%d-%H%M)"
DEST="$RACINE/$HORODATAGE"
VOLUME="erp-ageroute_erp_uploads"
CONTENEUR_DB="erp-db"

mkdir -p "$DEST"

echo "[1/4] PostgreSQL -> $DEST/erp.dump"
docker exec "$CONTENEUR_DB" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$DEST/erp.dump"
[ -s "$DEST/erp.dump" ] || { echo "ECHEC : dump vide" >&2; exit 1; }

echo "[2/4] Volume $VOLUME -> $DEST/uploads.tar.gz"
docker run --rm -v "$VOLUME":/u:ro -v "$DEST":/s alpine tar czf /s/uploads.tar.gz -C /u .
[ -s "$DEST/uploads.tar.gz" ] || { echo "ECHEC : archive uploads vide" >&2; exit 1; }

echo "[3/4] Empreintes et manifeste"
( cd "$DEST" && sha256sum erp.dump uploads.tar.gz > SHA256SUMS )
{
  echo "date=$HORODATAGE"
  echo "serveur=$(hostname)"
  echo "dump_octets=$(stat -c %s "$DEST/erp.dump")"
  echo "uploads_octets=$(stat -c %s "$DEST/uploads.tar.gz")"
  echo "uploads_fichiers=$(tar tzf "$DEST/uploads.tar.gz" | grep -vc '/$' || true)"
  echo "image_backend=$(docker inspect erp-backend --format '{{.Image}}' 2>/dev/null || echo inconnue)"
} > "$DEST/MANIFESTE"

echo "[4/4] Rétention : suppression des sauvegardes de plus de 14 jours"
find "$RACINE" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +

echo "OK  $DEST"
cat "$DEST/MANIFESTE"
