# PROMPT DE DÉPLOIEMENT IMMÉDIAT — v2026.08.6

> À donner TEL QUEL à l'agent Claude sur le serveur 102.211.199.131.
> Pré-requis : l'archive `erp-ageroute-v2026.08.6.tar.gz` doit être dans le $HOME.

---

```text
Tu déploies la version v2026.08.6 de l'ERP AGEROUTE en production.
Cette version corrige 13 failles critiques du circuit financier, ajoute
les règles paramétrables et prépare la recette DAF.

Le déploiement doit être exécuté MAINTENANT — chaque jour sans déploiement
maintient l'exposition aux failles documentées.

RÈGLES ABSOLUES — aucune exception :
1. JAMAIS prisma db push (surtout --accept-data-loss)
2. pg_dump AVANT toute opération
3. docker compose down -v INTERDIT
4. Ne jamais afficher les valeurs du .env
5. Erreur inattendue → ARRÊT immédiat + rapport

═══════════════════════════════════════════════════════════════
ÉTAPE 0 — Sauvegarde de sécurité (30 secondes)
═══════════════════════════════════════════════════════════════

STAMP=$(date +%Y%m%d-%H%M%S)
docker exec erp-db pg_dump -U erpuser -Fc erp_ageroute \
  > ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
ls -lh ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
# Si le fichier est vide ou absent → ARRÊT

═══════════════════════════════════════════════════════════════
ÉTAPE 1 — Préparation du staging
═══════════════════════════════════════════════════════════════

mkdir -p ~/erp-deploy/staging-v6
tar -xzf ~/erp-ageroute-v2026.08.6.tar.gz -C ~/erp-deploy/staging-v6

# Préserver le .env (secrets déjà tournés, chmod 600)
if [ -f ~/erp-deploy/staging/.env ]; then
  cp ~/erp-deploy/staging/.env ~/erp-deploy/staging-v6/.env
  echo ".env transféré depuis le staging précédent"
elif [ -f /opt/erp-ageroute/.env ]; then
  cp /opt/erp-ageroute/.env ~/erp-deploy/staging-v6/.env
  echo ".env récupéré depuis la production"
fi
chmod 600 ~/erp-deploy/staging-v6/.env

# Vérifier : 14+ variables, aucune valeur __A_GENERER_
grep -c '=' ~/erp-deploy/staging-v6/.env
grep -c '__A_GENERER_' ~/erp-deploy/staging-v6/.env || echo "OK — pas de placeholder"

═══════════════════════════════════════════════════════════════
ÉTAPE 2 — Migrations SQL (5 fichiers, TOUS idempotents)
═══════════════════════════════════════════════════════════════

cd ~/erp-deploy/staging-v6

echo "=== Migration 1 : paiement soft-delete ==="
docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-13-paiement-soft-delete.sql

echo "=== Migration 2 : règles de gestion ==="
docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-18-regles-gestion.sql

echo "=== Migration 3 : confirmation BCRG ==="
docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-18-paiement-confirmation-bcrg.sql

echo "=== Migration 4 : snapshot règles par décompte ==="
docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-18-decompte-regles-snapshot.sql

echo "=== Migration 5 : cycle de vie des règles ==="
docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-18-regles-lifecycle.sql

echo "=== Vérifications ==="
docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d paiements' | grep -c "deletedAt\|montantReelGnf\|confirmePar"
docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d regle_gestion' | grep -c "cle\|statut\|soumisAt"
docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d decomptes' | grep -c "reglesSnapshot"

═══════════════════════════════════════════════════════════════
ÉTAPE 3 — Validation de build (avant de toucher la production)
═══════════════════════════════════════════════════════════════

cd ~/erp-deploy/staging-v6
docker compose -p erp-staging-v6 build 2>&1 | tail -5
# Si le build échoue → ARRÊT + rapport (ne pas déployer)

═══════════════════════════════════════════════════════════════
ÉTAPE 4 — DÉPLOIEMENT (4 commandes avec sudo)
═══════════════════════════════════════════════════════════════

⚠️  PRÉVENIR LES 20 UTILISATEURS AVANT D'EXÉCUTER :
La rotation des secrets JWT déconnectera tout le monde.

sudo rsync -a --exclude '.env' --delete ~/erp-deploy/staging-v6/ /opt/erp-ageroute/
sudo cp ~/erp-deploy/staging-v6/.env /opt/erp-ageroute/.env
cd /opt/erp-ageroute && sudo docker compose build && sudo docker compose up -d
docker volume ls | grep uploads

═══════════════════════════════════════════════════════════════
ÉTAPE 5 — Contrôles post-déploiement (11 vérifications)
═══════════════════════════════════════════════════════════════

echo "=== 1. Santé backend ==="
curl -sf http://localhost:4001/api/health && echo " ✓"

echo "=== 2. En-têtes de sécurité ==="
curl -sI https://gestion.ageroute.gov.gn/ | grep -E "Strict-Transport|Content-Security|X-Frame|X-Content"

echo "=== 3. API protégée ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" https://gestion.ageroute.gov.gn/api/decomptes)
[ "$CODE" = "401" ] && echo " ✓ 401 sans jeton" || echo " ✗ reçu $CODE"

echo "=== 4. Connexion ==="
# Se connecter avec un compte de test et vérifier la session

echo "=== 5. Module routier ==="
# Ouvrir le module routier — les tuiles OSM doivent s'afficher (CSP)

echo "=== 6. Upload PDF ==="
# Joindre un PDF à un attachement, l'ouvrir via URL signée

echo "=== 7. Fichier protégé ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" https://gestion.ageroute.gov.gn/api/uploads/files/test.pdf)
[ "$CODE" != "200" ] && echo " ✓ protégé ($CODE)" || echo " ✗ accessible sans auth !"

echo "=== 8. Modules restaurés ==="
for path in delegations export financements revision portail; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    https://gestion.ageroute.gov.gn/api/$path)
  echo "  /api/$path : $CODE"
done

echo "=== 9. Recherche globale ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://gestion.ageroute.gov.gn/api/search?q=test" | head -c 100

echo "=== 10. Logs backend ==="
docker logs erp-backend --tail 50 2>&1 | grep -i "error\|fatal" | head -5
echo "(vide = OK)"

echo "=== 11. Volume uploads ==="
docker inspect erp-backend --format '{{range .Mounts}}{{println .Destination}}{{end}}' | grep uploads

═══════════════════════════════════════════════════════════════
ÉTAPE 6 — Rapport final
═══════════════════════════════════════════════════════════════

Fournir :
- SHA/tag déployé : v2026.08.6
- Sauvegarde : ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump (taille)
- Migrations : 5 appliquées / 5 réussies
- Résultats des 11 contrôles (pass/échec)
- Incidents éventuels
- Confirmation : les utilisateurs doivent se reconnecter (rotation JWT)

═══════════════════════════════════════════════════════════════
ROLLBACK (si échec critique)
═══════════════════════════════════════════════════════════════

# Code : redéployer l'archive précédente
# Base (dernier recours) :
docker exec -i erp-db pg_restore -U erpuser -d erp_ageroute \
  --clean --if-exists < ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
```

---

## Après le déploiement — remettre à la DAF

1. **Imprimer ou partager** `RECETTE-DAF.md` (207 lignes, 12 scénarios chiffrés)
2. La DAF se connecte → **Paramétrage → Règles financières (A1-A10)**
3. Elle suit le guide, simule, arbitre, valide en quatre yeux
4. **PV signé** → le système est calé sur les règles métier définitives
5. L'exploitation réelle peut commencer
