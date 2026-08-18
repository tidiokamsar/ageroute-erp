# Prompt de déploiement — à donner à Claude Code sur le serveur de production

> Copier l'intégralité de ce document comme prompt initial. Claude n'a aucun
> autre contexte : ce document est autonome.

---

## CONTEXTE

Tu es chargé de mettre à jour l'ERP AGEROUTE en production. Tu travailles sur
le serveur **102.211.199.131** (Linux, Docker + Traefik), application
**https://gestion.ageroute.gov.gn**, répertoire de déploiement `/opt/erp-ageroute`.
Dépôt Git : `https://github.com/tidiokamsar/ageroute-erp` (branche `master`).

La mise à jour corrige : secrets JWT devinables, en-têtes de sécurité absents,
contrôle d'accès insuffisant sur les écritures financières, suppression physique
des paiements, pièces jointes sans authentification, 7 modules non montés,
injection SQL dans signature-audit, et un script de déploiement qui détruisait
des données (`prisma db push --accept-data-loss`).

## RÈGLES ABSOLUES — à ne jamais enfreindre

1. **JAMAIS `prisma db push`, surtout pas `--accept-data-loss`.** Les tables
   `bpmn_definitions`, `bpmn_steps`, `bpmn_instances`, `bpmn_actions`,
   `ref_troncons`, `ref_ouvrages`, `ref_inspections` sont hors schéma Prisma ;
   `db push` les supprime. Le schéma évolue UNIQUEMENT via les fichiers SQL de
   `backend/prisma/sql/` appliqués par `psql`.
2. **Toujours `pg_dump -Fc` avant toute opération de schéma**, et copie du dump
   hors du serveur (serveur 132 comme les sauvegardes quotidiennes).
3. Pas d'image Alpine pour le backend (Prisma exige `node:20-slim`).
4. Traefik : le certresolver s'appelle `le` (pas `letsencrypt`).
5. Ne jamais committer un secret, ne jamais afficher les valeurs du `.env`.
6. Le volume `erp_uploads` (pièces jointes) doit exister et être monté sur
   `/app/uploads` — vérifie-le, sa perte est irréversible.
7. Toute commande qui échoue → ARRÊT complet et rapport. Pas de contournement.

## ÉTAPE 0 — Pré-vol

```bash
cd /opt/erp-ageroute
docker compose ps                      # erp-db, erp-backend, erp-frontend attendus
docker volume inspect erp_ageroute_erp_uploads   # doit exister
df -h /                                # espace disque suffisant (> 2 Go libre)
git remote -v                          # origin = github.com/tidiokamsar/ageroute-erp
```

Note le SHA actuel : `git rev-parse HEAD` (référence de rollback).

## ÉTAPE 1 — Sauvegardes (obligatoires, avant tout)

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
# Base complète
docker compose exec -T erp-db pg_dump -U erpuser -Fc erp_ageroute \
  > /opt/backups/erp-ageroute-pre-deploy-$STAMP.dump
# Pièces jointes (volume erp_uploads)
docker run --rm -v erp_ageroute_erp_uploads:/data -v /opt/backups:/backup alpine \
  tar czf /backup/erp-uploads-pre-deploy-$STAMP.tar.gz -C /data .
# Copie hors-serveur (comme les sauvegardes quotidiennes, vers le 132)
scp /opt/backups/erp-ageroute-pre-deploy-$STAMP.dump \
    /opt/backups/erp-uploads-pre-deploy-$STAMP.tar.gz UTILISATEUR@SERVEUR132:/chemin/backup/
```

Vérifie que les deux fichiers existent et sont non vides (`ls -lh`). Sinon : ARRÊT.

## ÉTAPE 2 — Mise à jour du code

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
# Fusion des correctifs dans l'ordre (build-restore est le prérequis des autres)
git merge --no-ff origin/fix/build-restore    -m "merge: fix/build-restore"
git merge --no-ff origin/fix/p0-headers       -m "merge: fix/p0-headers"
git merge --no-ff origin/fix/p0-access-control -m "merge: fix/p0-access-control"
git merge --no-ff origin/fix/restore-modules  -m "merge: fix/restore-modules"
git merge --no-ff origin/fix/uploads-auth     -m "merge: fix/uploads-auth"
git merge --no-ff origin/fix/deploy-safety    -m "merge: fix/deploy-safety"
git merge --no-ff origin/fix/roles-workflows  -m "merge: fix/roles-workflows"
git merge --no-ff origin/fix/quality-ux      -m "merge: fix/quality-ux"
git push origin master
```

En cas de conflit : ARRÊT et rapport (ne résous pas à ta discrétion).

Note : master contient déjà l'intégralité des correctifs (tag v2026.08.3) —
les fusions ci-dessus seront des no-ops bénignes (« Already up to date »).
Vérifie simplement `git describe --tags` après `git pull` : il doit afficher
v2026.08.3 ; sinon ARRÊT et rapport.

## ÉTAPE 3 — Secrets du `.env`

Si `/opt/erp-ageroute/.env` contient encore des valeurs `__A_GENERER__` ou des
secrets « parlants » (motif `*_JWT_SECRET_*` ou dérivé du nom du projet) :

```bash
cd /opt/erp-ageroute
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET
openssl rand -base64 24   # → POSTGRES_PASSWORD (et même valeur dans DATABASE_URL)
```

Édite `.env` sur ces trois clés (et l'URL de base en conséquence), en t'appuyant
sur `.env.example`. **Ne modifie rien d'autre.** ATTENTION : changer
`POSTGRES_PASSWORD` exige aussi `ALTER USER erpuser WITH PASSWORD '...'` dans
PostgreSQL AVANT le redémarrage, sinon le backend ne se reconnectera pas — si
tu n'es pas certain de la manœuvre, change uniquement les secrets JWT aujourd'hui
et laisse le mot de passe base pour une fenêtre dédiée.

⚠️ La rotation des secrets JWT **déconnecte tous les utilisateurs** (leur jeton
devient invalide) : c'est voulu et définitif. Préviens les 20 utilisateurs du
pilot avant d'exécuter l'étape 5.

## ÉTAPE 4 — Migration SQL (jamais db push)

Une seule migration est en attente : `backend/prisma/sql/2026-08-13-paiement-soft-delete.sql`
(ajout de `deletedAt` aux paiements — idempotente).

```bash
cd /opt/erp-ageroute
docker compose exec -T erp-db psql -U erpuser -d erp_ageroute \
  -v ON_ERROR_STOP=1 < backend/prisma/sql/2026-08-13-paiement-soft-delete.sql
```

Puis vérifie : `docker compose exec -T erp-db psql -U erpuser -d erp_ageroute
-c '\d paiements'` → la colonne `deletedAt` doit apparaître.

## ÉTAPE 5 — Build et démarrage

```bash
cd /opt/erp-ageroute
docker compose build
docker compose up -d
docker compose ps
```

(Le backend régénère le client Prisma au build — le schéma `schema.prisma`
contient déjà `deletedAt`.)

## ÉTAPE 6 — Vérifications (tout doit passer)

| # | Contrôle | Commande / action | Attendu |
|---|---|---|---|
| 1 | Santé backend | `curl -sf http://localhost:4001/api/health` | `{"status":"ok"...}` |
| 2 | En-têtes sécurité | `curl -sI https://gestion.ageroute.gov.gn/` | HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options |
| 3 | API protégée | `curl -s https://gestion.ageroute.gov.gn/api/decomptes` | 401 |
| 4 | Connexion | se connecter avec un compte de test | session OK |
| 5 | Carte routière | ouvrir le module routier | tuiles OpenStreetMap affichées (CSP) |
| 6 | Pièces jointes | joindre un PDF à un attachement, puis l'ouvrir | dépôt OK, ouverture via URL signée |
| 7 | Fichier sans jeton | `curl -sI https://gestion.ageroute.gov.gn/api/uploads/files/test.pdf` | 401/403 (jamais 200) |
| 8 | Modules restaurés | pages Délégations, Financements, Révision, Portail entreprise, recherche globale | chargent sans 404 réseau |
| 9 | Injection SQL | `curl -s "https://gestion.ageroute.gov.gn/api/signature-audit?status='%20OR%201=1--"` (authentifié) | réponse vide/erreur propre, pas de fuite |
| 10 | Soft-delete paiement | supprimer un paiement de test (ADMIN) | disparaît des listes, `deletedAt` renseigné en base |
| 11 | Logs | `docker compose logs erp-backend --tail 100` | pas d'erreur en boucle |

## ÉTAPE 7 — Communication

Rédige un compte-rendu : SHA avant/après, dump et archives créés (chemins),
résultats des 11 contrôles, incidents éventuels. Préviens les utilisateurs que
la reconnexion est nécessaire (rotation des jetons).

## ROLLBACK (en cas d'échec)

```bash
cd /opt/erp-ageroute
git checkout <SHA-NOTÉ-ÉTAPE-0>
docker compose build && docker compose up -d
# Base si nécessaire (uniquement si la migration a causé le problème —
# la colonne deletedAt est inoffensive pour l'ancien code, restauration
# en dernier recours) :
docker compose exec -T erp-db pg_restore -U erpuser -d erp_ageroute \
  --clean --if-exists < /opt/backups/erp-ageroute-pre-deploy-<STAMP>.dump
```

## NE JAMAIS FAIRE

- `prisma db push` sous quelque forme que ce soit.
- `docker compose down -v` (supprimerait les volumes = les données).
- Modifier des formules financières (`decomptes.calc.ts`) sans validation DAF.
- Continuer après une erreur non comprise.
- Afficher ou copier le contenu du `.env` dans un rapport ou un commit.
