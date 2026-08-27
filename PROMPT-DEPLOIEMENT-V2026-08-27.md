# PROMPT DE DÉPLOIEMENT — v2026.08.27 (Session 3 — refresh tokens hachés, moteur unique étendu, cloisonnement résiduel)

> À donner TEL QUEL à l'agent Claude sur le serveur 102.211.199.131.
> Pré-requis : l'archive `erp-ageroute-v2026.08.27.tar.gz` (branche `master`
> après les merges des trois lots de la session 3) doit être dans le $HOME.

---

```text
Tu déploies la version v2026.08.27 de l'ERP AGEROUTE en production.

Cette version apporte (revue complète du dépôt en production du 27/08) :
- Refresh tokens stockés par EMPREINTE SHA-256 (plus aucun jeton en clair
  en base : un dump ne vaut plus des sessions de 7 jours)
- /api/decomptes/:id/calculate passe par le moteur de règles unique
  (taux du marché, ARMP/précompte/plancher/report, snapshot de rejeu)
- Bordereau de pièces figé sur décompte engagé (même garde que les montants)
- Référentiel des pièces obligatoires servi aux écrans par
  GET /api/pieces-obligatoires (fin des copies locales divergentes)
- Runbook de récupération du volume erp_uploads (docs/runbooks/)
- Cloisonnement des dernières lectures : score de conformité, enveloppes
  bailleurs, BPU et ordres de service, fiche projet, retards SLA
- npm audit fix : frontend 0 vulnérabilité en production ; backend reste
  2 connues (nodemailer, uuid — montées majeures à planifier à part)

⚠️ MIGRATION SQL OBLIGATOIRE (ÉTAPE 3) : purge des refresh tokens en clair.
   Sans elle et sans déploiement simultané, personne ne peut se reconnecter.

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

mkdir -p ~/erp-deploy/staging-v2026.08.27
tar -xzf ~/erp-ageroute-v2026.08.27.tar.gz -C ~/erp-deploy/staging-v2026.08.27

# Préserver le .env du déploiement précédent
if [ -f ~/erp-deploy/staging-v2026.08.26/.env ]; then
  cp ~/erp-deploy/staging-v2026.08.26/.env ~/erp-deploy/staging-v2026.08.27/.env
elif [ -f /opt/erp-ageroute/.env ]; then
  cp /opt/erp-ageroute/.env ~/erp-deploy/staging-v2026.08.27/.env
fi
chmod 600 ~/erp-deploy/staging-v2026.08.27/.env

# Vérifier les réglages de production :
grep -c "SIGNATURE_LAB_AUTORISE" ~/erp-deploy/staging-v2026.08.27/.env || true

═══════════════════════════════════════════════
ÉTAPE 2 — Vérification du contenu
═══════════════════════════════════════════════

ls -l ~/erp-deploy/staging-v2026.08.27/backend/prisma/sql/2026-08-27-refresh-tokens-haches.sql
ls -l ~/erp-deploy/staging-v2026.08.27/docs/runbooks/recuperation-volume-uploads.md

═══════════════════════════════════════════════
ÉTAPE 3 — MIGRATION SQL (avec le déploiement, pas avant)
═══════════════════════════════════════════════

# Purge des refresh tokens stockés en clair — la nouvelle version n'écrit
# et ne lit plus que des empreintes SHA-256. Effet : reconnexion unique de
# toutes les sessions ouvertes (assumé, doctrine « la rotation invalide »).
# Puis enum AuditAction + EXPORT : la génération de PDF ne se journalise
# plus « UPDATE » (sans réécriture rétroactive de l'historique).
for SQLFILE in 2026-08-27-refresh-tokens-haches.sql 2026-08-27-audit-action-export.sql; do
  docker exec -i erp-db psql -U erpuser -d erp_ageroute \
    < ~/erp-deploy/staging-v2026.08.27/backend/prisma/sql/$SQLFILE
done

# Contrôle :
docker exec erp-db psql -U erpuser -d erp_ageroute -tAc \
  'SELECT count(*) FROM refresh_tokens;'
# Attendu : 0

═══════════════════════════════════════════════
ÉTAPE 4 — Build et démarrage
═══════════════════════════════════════════════

cd ~/erp-deploy/staging-v2026.08.27
docker compose build
docker compose up -d
docker compose ps
docker logs erp-backend --tail 30   # contrôle UPLOAD_DIR + démarrage propre

═══════════════════════════════════════════════
ÉTAPE 5 — Contrôles fonctionnels
═══════════════════════════════════════════════

1. Connexion d'un compte interne puis d'un compte ENTREPRISE — la purge a
   révoqué les sessions : CHACUN doit pouvoir se reconnecter (login → jetons
   frais). Vérifier qu'une RECONNEXION fonctionne après rotation (F5 > 15 min).
2. GET /api/pieces-obligatoires avec un jeton valide → liste des pièces
   (source unique) ; l'écran Pièces d'un décompte l'affiche.
3. Tentative de PATCH /api/decomptes/<id-engage>/pieces → 409 « bordereau
   n'est plus modifiable ».
4. Un compte ENTREPRISE : GET /api/conformite/preview/<id d'une autre
   entreprise> → 404 ; ses propres scores → 200.
5. Un compte BAILLEUR : GET /api/fundings/fundings → 200 (rôle admis) ;
   depuis un compte ENTREPRISE → 403.
6. Décompte en brouillon : « Recalculer » (POST /calculate) → les montants
   restent ceux du moteur (TTC = HT + TVA 18 % + ARMP 0,6 %, etc.) même si
   le corps envoie des taux farfelus.

═══════════════════════════════════════════════
ÉTAPE 6 — Rapport
═══════════════════════════════════════════════

-> URL, hash du commit, résultat de chaque contrôle, anomalies.

═══════════════════════════════════════════════
ROLLBACK (si anomalie bloquante)
═══════════════════════════════════════════════

cd ~/erp-deploy/staging-v2026.08.26 && docker compose up -d   # version précédente
docker exec -i erp-db pg_restore -U erpuser -d erp_ageroute --clean \
  < ~/erp-deploy/backups/db-PRE-DEPLOY-$STAMP.dump
# Les refresh tokens restaurés redeviennent valides pour l'ANCIEN code
# (qui compare en clair) — cohérent.
```

---

## Récapitulatif de la livraison

| Élément | Détail |
|---|---|
| Branche | `master` (`50082ff` — merges des 3 lots de la session 3) |
| Tests | 268 au total — **265 pass / 0 échec / 3 ignorés** (PG_TEST=1) |
| Builds | backend `tsc` OK, frontend `vite` OK |
| Migrations | `2026-08-27-refresh-tokens-haches.sql` (purge jetons) + `2026-08-27-audit-action-export.sql` (enum EXPORT) — **psql uniquement**, avec le déploiement |
| Dépendances | montées semver-compatibles uniquement (audit fix) |
