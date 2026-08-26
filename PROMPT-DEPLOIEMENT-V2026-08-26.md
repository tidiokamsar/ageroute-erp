# PROMPT DE DÉPLOIEMENT — v2026.08.26 (Revue session 2 — cloisonnement, arbitrages DAF, report de pénalités)

> À donner TEL QUEL à l'agent Claude sur le serveur 102.211.199.131.
> Pré-requis : l'archive `erp-ageroute-v2026.08.26.tar.gz` (branche `master`
> après le merge « revue session 2 ») doit être dans le $HOME.

---

```text
Tu déploies la version v2026.08.26 de l'ERP AGEROUTE en production.

Cette version apporte (sept lots de la revue du 20/08/2026) :
- Cloisonnement complet : écritures d'attachements, dossier de marché,
  12 lectures marchés, 9 lectures entreprises, recherche globale, 5 exports
  CSV, dashboard (montants bornés par entreprise), rôles sur /api/audit et
  signature-audit, périmètre sur les actions de validation (workflow,
  circuit financier, BPMN), PDF officiels et rapport bailleur bornés
- Portail entreprise : le dépôt entre dans le circuit de validation unifié
  (statut DEPOSE, plus d'instance BPMN), calcul par le moteur de règles
  (entier, taux du marché), validation stricte du corps des requêtes
- Arbitrages DAF du 26/08/2026 : caution de bonne exécution INCONDITIONNELLE
  (marché sans caution enregistrée = aucun dépôt), net à payer BORNÉ À ZÉRO,
  assiettes TTC validées
- Report de l'excédent de pénalités sur le décompte suivant (A4)
- Alias historique ACTIF éradiqué (compteur « marchés actifs » réparé)

⚠️ CHANGEMENT DE SCHÉMA : nouvelle colonne decomptes."penalitesReporteesGnf".
   La migration SQL (ÉTAPE 3) est OBLIGATOIRE AVANT le rebuild — sans elle,
   le client Prisma régénéré échoue à chaque lecture du modèle.

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

mkdir -p ~/erp-deploy/staging-v2026.08.26
tar -xzf ~/erp-ageroute-v2026.08.26.tar.gz -C ~/erp-deploy/staging-v2026.08.26

# Préserver le .env (reprendre celui du déploiement précédent)
if [ -f ~/erp-deploy/staging-v8/.env ]; then
  cp ~/erp-deploy/staging-v8/.env ~/erp-deploy/staging-v2026.08.26/.env
elif [ -f /opt/erp-ageroute/.env ]; then
  cp /opt/erp-ageroute/.env ~/erp-deploy/staging-v2026.08.26/.env
fi
chmod 600 ~/erp-deploy/staging-v2026.08.26/.env

═══════════════════════════════════════════════
ÉTAPE 2 — Vérification du contenu
═══════════════════════════════════════════════

# Le commit attendu est le merge « revue session 2 » (7 lots) :
cd ~/erp-deploy/staging-v2026.08.26 && git log --oneline -3 2>/dev/null || true
# Le fichier de migration doit être présent :
ls -l backend/prisma/sql/2026-08-26-report-penalites.sql

═══════════════════════════════════════════════
ÉTAPE 3 — MIGRATION SQL (obligatoire, AVANT le rebuild)
═══════════════════════════════════════════════

docker exec -i erp-db psql -U erpuser -d erp_ageroute \
  < ~/erp-deploy/staging-v2026.08.26/backend/prisma/sql/2026-08-26-report-penalites.sql

# Contrôle immédiat — la colonne doit exister :
docker exec erp-db psql -U erpuser -d erp_ageroute -c \
  'SELECT column_name, data_type, column_default FROM information_schema.columns
   WHERE table_name = '"'"'decomptes'"'"' AND column_name = '"'"'penalitesReporteesGnf'"'"';'
# Attendu : penalitesReporteesGnf | bigint | 0

═══════════════════════════════════════════════
ÉTAPE 4 — Build et démarrage
═══════════════════════════════════════════════

cd ~/erp-deploy/staging-v2026.08.26
docker compose build
docker compose up -d
docker compose ps

# Le client Prisma se régénère au build (la colonne existe déjà → OK).
# Volumétrie des logs puis santé :
docker logs erp-backend --tail 30
curl -s http://localhost:4001/api/health 2>/dev/null || true

═══════════════════════════════════════════════
ÉTAPE 5 — Contrôles fonctionnels (compte de test)
═══════════════════════════════════════════════

1. Connexion OK (un compte interne, un compte ENTREPRISE).
2. Dépôt portail : créer un dépôt → le message doit dire
   « circuit « … » démarré » et le décompte apparaît au statut DEPOSE
   (plus jamais SOUMIS), visible dans le suivi de l'entreprise.
3. Marché SANS caution de bonne exécution : le dépôt doit être REFUSÉ
   (« Aucune garantie de bonne exécution n'est enregistrée… ») — décision
   DAF du 26/08/2026. Pour la démonstration : node scripts/seed-chaine-demo.cjs
   (crée les cautions, MCHE-2025-002 reste bloquée à dessein).
4. Décompte avec pénalités > montant : net à payer = 0 et non négatif ;
   l'excédent est porté par la colonne penalitesReporteesGnf et sera
   consommé par le décompte suivant du marché.
5. Tableau de bord : « marchés actifs » non nul ; compte ENTREPRISE : les
   montants affichés sont les SIENS (entrepriseFilter alimenté).
6. Exports CSV et recherche globale depuis un compte ENTREPRISE : ne
   contiennent que ses données.
7. GET /api/decomptes/<id-inconnu-ou-d-autrui> depuis un compte non
   autorisé : 404.

═══════════════════════════════════════════════
ÉTAPE 6 — Rapport
═══════════════════════════════════════════════

-> URL, version, hash du commit, résultat de chaque contrôle, anomalies.

═══════════════════════════════════════════════
ROLLBACK (si anomalie bloquante)
═══════════════════════════════════════════════

cd ~/erp-deploy/staging-v8 && docker compose up -d   # version précédente
docker exec -i erp-db pg_restore -U erpuser -d erp_ageroute --clean \
  < ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
# La colonne supplémentaire est inoffensive pour l'ancien code (ignorée).
```

---

## Récapitulatif de la livraison

| Élément | Détail |
|---|---|
| Branche | `master` (merge « revue session 2 », 7 lots) |
| Tests | 245 au total — **242 pass / 0 échec / 3 ignorés** (PG_TEST=1, preuve sur copie restaurée) |
| Builds | backend `tsc` OK, frontend `vite` OK |
| Migration | `backend/prisma/sql/2026-08-26-report-penalites.sql` — **psql uniquement** |
| Dépendances | aucune nouvelle |
| Archive | à construire depuis `master` : `git archive` ou tar du working tree propre |
