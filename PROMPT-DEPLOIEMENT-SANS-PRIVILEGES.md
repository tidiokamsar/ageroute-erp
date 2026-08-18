# Prompt de déploiement — environnement RESTREINT (sans sudo, sans git, /opt non inscriptible)

> À donner à l'agent sur le serveur **à la place** de PROMPT-DEPLOIEMENT-CLAUDE.md
> lorsque le pré-vol échoue sur : pas de dépôt git dans /opt/erp-ageroute,
> écriture refusée, pas de sudo, pas de /opt/backups, pas de volume uploads.
> Stratégie : exécuter immédiatement tout ce qui ne dépend pas de ces
> blocages (sauvegardes dans $HOME, migration SQL via docker exec, staging
> complet dans $HOME), puis remettre à l'opérateur une check-list de
> QUATRE commandes. Copier l'intégralité de ce document comme prompt.

---

## CONTEXTE

Serveur **102.211.199.131** (Docker + Traefik), application
https://gestion.ageroute.gov.gn, répertoire `/opt/erp-ageroute` (déployé
historiquement par archive tar — il n'y a jamais eu de git dedans, c'est
normal). L'archive de release **`erp-ageroute-v2026.08.3.tar.gz`** (source
complète, tag v2026.08.1) sera déposée dans ton `$HOME` par l'équipe.

Tu as accès à **docker** (tu peux `docker ps`, `docker exec`, `docker inspect`)
mais **ni sudo, ni écriture sur /opt**. Tu travailles exclusivement dans
`$HOME`. Tu ne modifies JAMAIS les conteneurs en production autrement que par
les commandes de sauvegarde/migration ci-dessous.

## RÈGLES ABSOLUES

1. JAMAIS `prisma db push` sous quelque forme que ce soit. Le schéma évolue
   uniquement via `backend/prisma/sql/*.sql` appliqué par psql.
2. Ne jamais afficher ni copier dans un rapport la VALEUR des variables
   d'environnement (seuls les NOMS peuvent apparaître). Les valeurs transitent
   uniquement par redirection vers des fichiers.
3. Sauvegarde pg_dump AVANT toute opération sur la base.
4. `docker compose down -v` interdit (détruirait les volumes).
5. Toute erreur inattendue → ARRÊT et rapport, pas de contournement.

## PHASE 1 — Diagnostic (exécutable immédiatement, lecture seule)

```bash
mkdir -p ~/erp-deploy/{backups,staging,rapport}
docker ps --format '{{.Names}}\t{{.Status}}' | tee ~/erp-deploy/rapport/containers.txt
docker inspect erp-backend --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' | tee ~/erp-deploy/rapport/mounts.txt
docker exec erp-backend ls -la /app/uploads 2>/dev/null | tee ~/erp-deploy/rapport/uploads.txt
```

- Confirme dans le rapport : conteneurs attendus (erp-db, erp-backend,
  erp-frontend + traefik), `Mounts` du backend (l'absence de volume uploads
  est le défaut connu que cette release corrige), contenu de /app/uploads
  (s'il est vide, aucune migration de fichiers ne sera nécessaire).
- Noms des variables d'environnement actuelles (noms seulement) :
  `docker inspect erp-backend --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | tee ~/erp-deploy/rapport/env-noms.txt`

## PHASE 2 — Sauvegardes vers $HOME (exécutable immédiatement)

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
docker exec erp-db pg_dump -U erpuser -Fc erp_ageroute > ~/erp-deploy/backups/db-pre-deploy-$STAMP.dump
ls -lh ~/erp-deploy/backups/   # le dump doit être non vide
# Pièces jointes si le répertoire n'est PAS vide (sinon ignorer) :
docker run --rm -v /var/lib/docker/volumes:/vols -v ~/erp-deploy/backups:/backup alpine true 2>/dev/null || \
  docker exec erp-backend tar czf - /app/uploads 2>/dev/null > ~/erp-deploy/backups/uploads-pre-deploy-$STAMP.tar.gz || true
```

Si le dump est vide ou la commande échoue → ARRÊT et rapport.

## PHASE 3 — Préparation du staging dans $HOME (dès réception de l'archive)

```bash
tar -xzf ~/erp-ageroute-v2026.08.3.tar.gz -C ~/erp-deploy/staging
```

Si un staging issu d'une version antérieure existe déjà (v2026.08.1/2) :
le rafraîchir plutôt que repartir de zéro — dans le clone git de staging
(`git pull --ff-only origin master`, vérifier `git describe --tags` =
v2026.08.3) ou re-extraire l'archive après avoir préservé le `.env`
préparé (droits 600, secrets déjà tournés — ne pas les regénérer).

Prépare le `.env` du staging — reprise des valeurs base SANS les afficher,
rotation des secrets JWT (déconnecte tous les utilisateurs : prévenir avant
l'étape opérateur) :

```bash
cd ~/erp-deploy/staging
cp .env.example .env
# Valeurs de connexion existantes (transfert direct, aucun affichage) :
docker inspect erp-backend --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DATABASE_URL|POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|CORS_ORIGIN|SMTP_|GEOPORTAIL_URL)=' \
  | while IFS='=' read -r k v; do
      case "$k" in
        POSTGRES_PASSWORD) sed -i "s|^POSTGRES_PASSWORD=.*|$k=$v|" .env
                            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://erpuser:$v@erp-db:5432/erp_ageroute|" .env ;;
        *) sed -i "s|^$k=.*|$k=$v|" .env ;;
      esac
    done
# Rotation des secrets JWT (obligatoire — les anciens sont compromis) :
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 48)|" .env
chmod 600 .env
grep -c '=' .env   # contrôle : nombre de variables, SANS afficher les valeurs
```

Note : on ne touche PAS au mot de passe PostgreSQL (il resterait à traiter
avec `ALTER USER` dans une fenêtre dédiée — ne pas improviser).

## PHASE 4 — Migration SQL (exécutable immédiatement — idempotente)

```bash
docker exec -i erp-db psql -U erpuser -d erp_ageroute -v ON_ERROR_STOP=1 \
  < ~/erp-deploy/staging/backend/prisma/sql/2026-08-13-paiement-soft-delete.sql
docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d paiements'
```

La colonne `deletedAt` doit apparaître. L'ancien code l'ignore sans dommage —
cette migration peut vivre en production avant le redéploiement.

## PHASE 5 — Check-list OPÉRATEUR (la seule étape nécessitant des droits)

Remets ce bloc tel quel à l'administrateur disposant de sudo :

```bash
sudo rsync -a --exclude '.env' --delete ~/erp-deploy/staging/ /opt/erp-ageroute/
sudo cp ~/erp-deploy/staging/.env /opt/erp-ageroute/.env
cd /opt/erp-ageroute && sudo docker compose build && sudo docker compose up -d
docker volume ls | grep uploads    # le volume erp_uploads doit désormais exister
```

⚠️ Prévenir les utilisateurs AVANT : la rotation des secrets JWT déconnecte
tout le monde (reconnexion nécessaire).

## PHASE 6 — Vérifications post-déploiement (reprendre la main après l'opérateur)

1. `curl -sf http://localhost:4001/api/health` → status ok
2. `curl -sI https://gestion.ageroute.gov.gn/` → HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options
3. `curl -s https://gestion.ageroute.gov.gn/api/decomptes` → 401
4. Connexion compte de test → session OK (anciens jetons refusés = normal)
5. Module routier → tuiles OpenStreetMap affichées
6. Joindre un PDF à un attachement puis l'ouvrir → URL signée, affichage OK
7. `curl -sI .../api/uploads/files/test.pdf` → 401/403, jamais 200
8. Pages Délégations, Financements, Révision, Portail entreprise, recherche → pas de 404
9. Suppression d'un paiement de test (ADMIN) → absent des listes, `deletedAt` en base
10. `docker logs erp-backend --tail 100` → pas d'erreur en boucle
11. `docker inspect erp-backend --format '{{range .Mounts}}{{println .Destination}}{{end}}'` → /app/uploads monté

## ROLLBACK

- Code : l'opérateur re-déploie l'archive précédente (ou `cd /opt/erp-ageroute
  && docker compose up -d --no-build` avec l'image antérieure si présente).
- Base (dernier recours) : `docker exec -i erp-db pg_restore -U erpuser -d
  erp_ageroute --clean --if-exists < ~/erp-deploy/backups/db-pre-deploy-<STAMP>.dump`
- Secrets : reprendre les anciennes valeurs JWT depuis l'ancien .env serveur
  restaure les sessions (déconseillé — secrets compromis).

## RAPPORT FINAL

SHA/tag déployé (v2026.08.1), chemins des sauvegardes, résultat de la
migration (colonne deletedAt), horodatage de l'intervention opérateur,
résultats des 11 contrôles, incidents.
