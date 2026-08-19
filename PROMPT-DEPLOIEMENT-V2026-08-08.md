# PROMPT DE DÉPLOIEMENT — v2026.08.8 (Vague V1 complète)

> À donner TEL QUEL à l'agent Claude sur le serveur 102.211.199.131.
> Pré-requis : l'archive `erp-ageroute-v2026.08.8.tar.gz` doit être dans le $HOME.

---

```text
Tu déploies la version v2026.08.8 de l'ERP AGEROUTE en production.

Cette version apporte :
- Correctifs critiques : validateurs débloqués, visibilité corrigée
- Bordereau récapitulatif cumulatif (Situation du Marché PDF)
- Rapports bailleurs automatisés (JSON + Excel + PDF)
- Documents officiels avec logo AGEROUTE (décompte, attachement, PV)
- Libellés d'états unifiés (fin du doublon SOUMIS/DEPOSE)

RÈGLES ABSOLUES :
1. JAMAIS prisma db push
2. pg_dump AVANT toute opération
3. docker compose down -v INTERDIT
4. Ne jamais afficher les valeurs du .env
5. Erreur → ARRÊT + rapport

═══════════════════════════════════════════════
ÉTAPE 0 — Sauvegarde
═══════════════════════════════════════════════

STAMP=$(date +%Y%m%d-%H%M%S)
docker exec erp-db pg_dump -U erpuser -Fc erp_ageroute \
  > ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
ls -lh ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump

═══════════════════════════════════════════════
ÉTAPE 1 — Staging
═══════════════════════════════════════════════

mkdir -p ~/erp-deploy/staging-v8
tar -xzf ~/erp-ageroute-v2026.08.8.tar.gz -C ~/erp-deploy/staging-v8

# Préserver le .env
if [ -f ~/erp-deploy/staging-v6/.env ]; then
  cp ~/erp-deploy/staging-v6/.env ~/erp-deploy/staging-v8/.env
elif [ -f /opt/erp-ageroute/.env ]; then
  cp /opt/erp-ageroute/.env ~/erp-deploy/staging-v8/.env
fi
chmod 600 ~/erp-deploy/staging-v8/.env
grep -c '=' ~/erp-deploy/staging-v8/.env

═══════════════════════════════════════════════
ÉTAPE 2 — Migrations SQL (déjà appliquées en v2026.08.7)
═══════════════════════════════════════════════

Les 5 migrations de la v2026.08.7 sont déjà en base.
Cette version n'ajoute AUCUNE nouvelle migration.
Vérifie seulement que les tables existent :

docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d regle_gestion' | head -5
docker exec erp-db psql -U erpuser -d erp_ageroute -c "SELECT column_name FROM information_schema.columns WHERE table_name='paiements' AND column_name IN ('deletedAt','montantReelGnf','confirmePar')"

═══════════════════════════════════════════════
ÉTAPE 3 — Validation de build
═══════════════════════════════════════════════

cd ~/erp-deploy/staging-v8
docker compose -p erp-staging-v8 build 2>&1 | tail -5
# Vérifier que le logo est dans l'image :
docker run --rm erp-staging-v8-erp-backend ls -la /app/assets/ageroute-logo.jpg

═══════════════════════════════════════════════
ÉTAPE 4 — Déploiement
═══════════════════════════════════════════════

⚠️  Les utilisateurs seront déconnectés (secrets JWT).

# Arrêter les anciens conteneurs du projet staging précédent si actifs
docker compose -p erp-staging-v6 down 2>/dev/null || true
docker compose -p erp-staging down 2>/dev/null || true

# Démarrer la nouvelle version
cd ~/erp-deploy/staging-v8
docker compose -p erp-ageroute up -d --build

═══════════════════════════════════════════════
ÉTAPE 5 — Contrôles (12 vérifications)
═══════════════════════════════════════════════

echo "=== 1. Santé ==="
curl -sf http://localhost:4001/api/health && echo " ✓"

echo "=== 2. En-têtes sécurité ==="
curl -sI https://gestion.ageroute.gov.gn/ | grep -cE "Strict-Transport|Content-Security|X-Frame|X-Content"

echo "=== 3. API protégée ==="
curl -s -o /dev/null -w "%{http_code}" https://gestion.ageroute.gov.gn/api/decomptes

echo "=== 4. Logo dans le conteneur ==="
docker exec erp-backend ls -la /app/assets/ageroute-logo.jpg 2>/dev/null && echo " ✓" || echo " ✗"

echo "=== 5. Bordereau PDF accessible ==="
# Nécessite un token — vérifier juste que la route existe
curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/marches/test/situation-bordereau/pdf

echo "=== 6. Rapport bailleur accessible ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/export/rapport-bailleur

echo "=== 7. Document décompte accessible ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/api/documents/decompte/test/pdf

echo "=== 8. Fichier protégé ==="
curl -s -o /dev/null -w "%{http_code}" https://gestion.ageroute.gov.gn/api/uploads/files/test.pdf

echo "=== 9. Logs ==="
docker logs erp-backend --tail 30 2>&1 | grep -ci "error" || echo "0 erreurs"

echo "=== 10. Volume uploads ==="
docker volume ls | grep uploads

echo "=== 11. Données intactes ==="
docker exec erp-db psql -U erpuser -d erp_ageroute -c "SELECT count(*) FROM utilisateurs"
docker exec erp-db psql -U erpuser -d erp_ageroute -c "SELECT count(*) FROM marches"

echo "=== 12. Conteneurs ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep erp

═══════════════════════════════════════════════
RAPPORT FINAL
═══════════════════════════════════════════════

- Version : v2026.08.8
- Sauvegarde : chemin + taille
- Build : réussi/échoué
- Logo : présent/absent dans l'image
- 12 contrôles : pass/échec
- Données : intactes/modifiées
- Incidents

ROLLBACK :
docker compose -p erp-ageroute down
docker compose -p erp-staging-v6 up -d  # version précédente
```
