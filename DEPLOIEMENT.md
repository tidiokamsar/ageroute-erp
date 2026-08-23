# Déploiement — procédure canonique

**Ce document remplace `deploy.sh`, retiré le 22/08/2026.** Le script arrêtait ERPNext et
supprimait ses volumes à chaque exécution, puis testait `localhost:4001` — port que le backend
ne publie pas — et annonçait « Déploiement terminé » même sur échec. Il n'a pas servi depuis le
18/08 ; tous les déploiements depuis sont faits selon la procédure ci-dessous.

Les autres `PROMPT-DEPLOIEMENT-*.md` sont des runbooks historiques : **celui-ci fait foi**.

## Ce qui tourne

| | |
|---|---|
| Serveur | `102.211.199.131` via `ssh gec` (rebond `.132`, parfois instable — réessayer) |
| Répertoire | `/home/agergec/erp-deploy/staging-sig` |
| Projet Compose | **`-p erp-ageroute`** — obligatoire, sinon Compose cherche un autre projet |
| Conteneurs | `erp-db`, `erp-backend`, `erp-frontend` |
| Volume critique | `erp-ageroute_erp_uploads` → `/app/uploads` — **sa perte est irréversible** |
| Port backend | 4001, **non publié** sur l'hôte — tester par le réseau Compose ou l'URL HTTPS |
| URL | `https://gestion.ageroute.gov.gn` |

## Règles absolues

- **Jamais `prisma db push`**, surtout pas `--accept-data-loss` : il détruit `bpmn_*`, `ref_*`
  et les tables `sig_*` hors schéma. Le schéma évolue **uniquement** par `backend/prisma/sql/*.sql`.
- **Jamais `docker compose down -v`** : supprime les volumes, donc les données.
- **`pg_dump -Fc` avant toute opération de schéma**, copie hors du serveur (`F:\ERP-sauvegarde\dumps\`).
- **Répétition sur copie restaurée** avant toute migration en production (cf. §4).
- Toute commande qui échoue → **arrêt et rapport**. Pas de contournement.
- Ne jamais afficher ni copier le `.env`.

## 1. Avant de commencer

```bash
cd /f/ERP-deploy && git status --short        # arbre propre, branche connue
cd backend && npx tsc --noEmit && node scripts/run-tests.mjs   # types + tests verts
cd ../frontend && npx tsc --noEmit
```

Ne rien déployer qui ne soit **commité**. Le serveur ne doit jamais porter un état absent du dépôt.

## 2. Copier les fichiers modifiés

Seuls les fichiers changés sont copiés — pas l'arborescence entière, pas le `.env`.

```bash
D=/home/agergec/erp-deploy/staging-sig
files=$(git diff --name-only <dernier-commit-deploye> HEAD -- backend/src backend/prisma frontend/src backend/assets)
for f in $files; do scp -q "$f" "gec:$D/$f" || echo "ECHEC $f"; done
```

**Vérifier l'intégrité** par empreinte, en neutralisant les fins de ligne (le dépôt est en CRLF,
le serveur en LF) :

```bash
for f in $files; do
  L=$(tr -d '\r' < "$f" | sha256sum | cut -c1-12)
  R=$(ssh gec "tr -d '\r' < $D/$f | sha256sum | cut -c1-12")
  [ "$L" = "$R" ] && echo "OK   $f" || echo "DIFF $f"
done
```

Un `DIFF` = arrêt.

## 3. Reconstruire et redémarrer

```bash
ssh gec "cd $D && docker compose -p erp-ageroute build erp-backend erp-frontend 2>&1 | grep -Ei 'error|failed|Built' && docker compose -p erp-ageroute up -d erp-backend erp-frontend"
```

`build` régénère le client Prisma (le `Dockerfile` fait `prisma generate`) : indispensable dès que
`schema.prisma` change, sans quoi le client ignore les nouvelles valeurs et **toute lecture
échoue**.

## 4. Migration SQL — seulement si un fichier `prisma/sql/*.sql` est nouveau

Ordre impératif. Chaque étape conditionne la suivante.

```bash
# a) sauvegarde, copie hors serveur
ssh gec 'docker exec erp-db sh -c "pg_dump -U \$POSTGRES_USER -Fc \$POSTGRES_DB" > /tmp/avant.dump'
scp gec:/tmp/avant.dump /f/ERP-sauvegarde/dumps/avant-<objet>-$(date +%Y%m%d).dump

# b) répétition sur une copie restaurée, dans un conteneur jetable
ssh gec 'docker run -d --name erp-repetition -e POSTGRES_PASSWORD=r -e POSTGRES_USER=rep -e POSTGRES_DB=rep postgres:16-alpine
         sleep 8; docker cp /tmp/avant.dump erp-repetition:/tmp/d.dump
         docker exec erp-repetition pg_restore -U rep -d rep --no-owner --no-privileges /tmp/d.dump'
scp backend/prisma/sql/<fichier>.sql gec:/tmp/
ssh gec 'docker exec -i erp-repetition psql -U rep -d rep -v ON_ERROR_STOP=1 < /tmp/<fichier>.sql'   # 1er passage
ssh gec 'docker exec -i erp-repetition psql -U rep -d rep -v ON_ERROR_STOP=1 < /tmp/<fichier>.sql'   # 2e passage : idempotence
ssh gec 'docker rm -f erp-repetition'

# c) production — seulement si a) et b) ont réussi
ssh gec 'docker exec -i erp-db sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1" < /tmp/<fichier>.sql'
```

Rappels : colonnes en **camelCase quoté** (`"userId"`), les modèles n'ont pas de `@map` ; un
`ALTER TYPE … ADD VALUE` est **irréversible** ; quand un rôle devient « à périmètre », affecter les
comptes existants **avant** de déployer le code, sinon ils deviennent aveugles.

## 5. Vérifier — bloquant

```bash
curl -s -o /dev/null -w "API %{http_code}\n" https://gestion.ageroute.gov.gn/api/health   # 200
curl -s -o /dev/null -w "UI  %{http_code}\n" https://gestion.ageroute.gov.gn/             # 200
ssh gec 'docker inspect erp-backend --format "{{range .Mounts}}{{.Name}}{{end}}"'         # erp-ageroute_erp_uploads
ssh gec 'docker logs erp-backend --tail 20'                                                # pas d'erreur, pas de « logo introuvable »
```

Puis **exercer le comportement déployé** avec un jeton admin — une route nouvelle, une route
retirée (410 attendu), un PDF généré et relu. Un déploiement n'est terminé que quand le
comportement attendu est **observé**, pas quand `up -d` a rendu la main.

## 6. Retour arrière

Le code précédent est dans Git : refaire §2–§3 depuis le commit antérieur. Une migration SQL
additive ne se retire pas ; c'est pourquoi §4 exige la répétition sur copie.

## 7. Preuves PostgreSQL — avant toute recette du circuit de paiement

Les tests unitaires ne prouvent ni le verrou `FOR UPDATE` ni le rollback. Le fichier
`backend/src/modules/paiements/paiements.service.pg.test.ts` le fait sur une **copie restaurée**
(il est `skipped` sans `PG_TEST=1` et refuse toute URL ressemblant à la production).

Le 22/08/2026, sa première exécution a révélé que `AuditAction.CONFIRM_BCRG` n'existait pas en
base : la seule voie vers `PAYE` était cassée en production sans que rien ne l'indique.

```bash
# copie restaurée sur le réseau Compose (cf. §4b), puis image de test
ssh gec 'cd $D/backend && docker build --target builder -t erp-backend-builder .'
ssh gec 'docker run --rm --network erp-ageroute_erp-net -v $D/backend/src:/app/src:ro \
  -e PG_TEST=1 -e DATABASE_URL="postgresql://rep:r@erp-repetition:5432/rep" \
  -e JWT_SECRET="<32 caractères de test>" -e JWT_REFRESH_SECRET="<32 caractères de test>" -e NODE_ENV=test \
  erp-backend-builder npx tsx --test src/modules/paiements/paiements.service.pg.test.ts'
```

Attendu : `# pass 3`. Le conteneur `erp-repetition` est supprimé ensuite.

## 8. Sauvegarde quotidienne — base ET pièces

`scripts/sauvegarde.sh`, installé en `~/sauvegarde.sh` sur le serveur et lancé par cron chaque
jour à 02:00, produit dans `/home/agergec/sauvegardes/AAAAMMJJ-HHMM/` :

| Fichier | Contenu |
|---|---|
| `erp.dump` | `pg_dump -Fc` de la base |
| `uploads.tar.gz` | le volume `erp-ageroute_erp_uploads` — **les pièces jointes, que `deploy.sh` n'a jamais sauvegardées** |
| `SHA256SUMS`, `MANIFESTE` | empreintes, tailles, nombre de fichiers, image backend en service |

Rétention 14 jours sur le serveur. **Copier le dossier hors du serveur** (`F:\ERP-sauvegarde\`)
au moins chaque semaine : une sauvegarde qui vit sur la machine qu'elle protège n'en est pas
une. Journal : `~/sauvegardes/journal.log`.

Restauration = §4b pour la base, puis `docker run --rm -v erp-ageroute_erp_uploads:/u -v
<dossier>:/s alpine tar xzf /s/uploads.tar.gz -C /u` pour les pièces — **les deux ensemble**,
d'une même sauvegarde, sinon les dossiers renvoient à des fichiers qui n'existent pas.

## 9. Reconstruire une base vierge

`backend/prisma/sql/0000-baseline-2026-08-22.sql` est l'état complet du schéma (76 tables, dont
`bpmn_*`, `ref_*`, `sig_*` hors Prisma). Sur un PostgreSQL vierge :

```bash
psql -v ON_ERROR_STOP=1 -f 0000-baseline-2026-08-22.sql
for f in 2026-*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done    # idempotents
node dist/lib/seed.js
```

Prouvé le 22/08/2026 sur un conteneur jetable. Régénérer la baseline après chaque série de
migrations (voir `backend/prisma/sql/README.md`).

## 10. Clore

Noter dans le message de commit ou le rapport : commit déployé, fichiers copiés, migrations
appliquées, vérifications observées, et ce qui n'a **pas** pu être prouvé.
