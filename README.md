# ERP AGEROUTE Guinée — Système e-Décomptes

ERP métier de l'**AGEROUTE** (Agence de Gestion des Routes, Guinée). Il gère la
chaîne **Projets → Marchés → Attachements → Décomptes → Validation → Paiement**,
avec référentiel entreprises, score de conformité, workflows de validation
paramétrables par bailleur, signature électronique, journal d'audit et portail
entreprise.

> Système **financier public** : il calcule et ordonnance des paiements réels
> sur fonds publics et fonds de bailleurs (Banque Mondiale, BAD, FER, Budget
> National). Les montants sont en **GNF, stockés en `BigInt`, jamais en flottant**.

**Production** : https://gestion.ageroute.gov.gn (Docker + Traefik, serveur 102.211.199.131).

## Stack

| Couche | Technologie |
|---|---|
| Backend | Node 20 (`node:20-slim`) · Express · TypeScript · Prisma · PostgreSQL 16 |
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · React Router · TanStack Query |
| Auth | JWT access + refresh (rotation), RBAC par rôle + override par module (`checkModuleAccess`) |
| Sécurité | helmet + CSP/HSTS côté nginx, URL signées HMAC pour les pièces jointes, rate limiting |
| Infra | Docker Compose (db, backend, frontend), Traefik v3 (certresolver `le`) |
| Tests | `node:test` via `tsx` — `npm test` |

## Structure

```
backend/
  src/
    app.ts               montage des routes + middlewares (ordre : requireAuth AVANT checkModuleAccess)
    config/env.ts        validation zod des variables d'environnement
    lib/                 prisma, jwt, audit, scope (isolation entreprise), delegations, affectations…
    middleware/          auth, rbac, moduleAccess, error
    modules/<domaine>/   routes.ts · service.ts · schema.ts — 25 modules métier
  prisma/
    schema.prisma        modèle (les tables bpmn_* / ref_* sont hors schéma, accès $queryRaw)
    sql/                 migrations SQL manuelles — JAMAIS prisma db push
frontend/
  src/
    pages/               une page par module + portail entreprise
    components/          layout (Sidebar, GlobalSearch), ui (Modal, ConfirmDialog, SecureFile…)
    lib/                 api (JWT + refresh), secureFile (URL signées), auth
deploy.sh                déploiement serveur (pg_dump auto, SQL via psql)
PROMPT-DEPLOIEMENT-*.md  runbooks de déploiement (standard / environnement restreint)
```

## Démarrage (développement)

```bash
cp .env.example .env          # renseigner secrets et base (jamais de valeur __A_GENERER__)
docker compose up -d          # postgres
cd backend  && npm ci && npm run dev    # http://localhost:4001
cd frontend && npm ci && npm run dev    # http://localhost:5173 (proxy /api)
```

## Vérifications

```bash
cd backend  && npx tsc && npm test     # 0 erreur, 20 tests
cd frontend && npm run build
```

## Règles absolles (extrait — voir AGENTS.md, le contrat complet)

1. **Jamais `prisma db push`** (surtout `--accept-data-loss`) — il détruit les
   tables hors schéma. Schéma = `schema.prisma` + SQL manuel dans `prisma/sql/`.
2. `pg_dump -Fc` avant toute opération de schéma.
3. Pas d'image Alpine pour le backend (Prisma exige `node:20-slim`).
4. Ne pas retirer `import "./lib/bigint"` en tête de `app.ts`.
5. Aucune modification de formule financière sans validation de la DAF.
6. Toute action sensible produit une entrée d'audit (`logAudit`) ; soft delete
   sur décomptes / paiements / audit.
7. Les pièces jointes passent par `POST /api/uploads` (authentifié, types
   filtrés, octets magiques) et s'ouvrent par URL signée éphémère (15 min).

## Déploiement

Deux runbooks selon l'accès au serveur : `PROMPT-DEPLOIEMENT-CLAUDE.md`
(environnement git + sudo) et `PROMPT-DEPLOIEMENT-SANS-PRIVILEGES.md`
(sans sudo ni git : tout ce qui est possible dans `$HOME` + 4 commandes
opérateur). La rotation des secrets JWT déconnecte tous les utilisateurs —
c'est voulu.

## Releases

| Tag | Contenu |
|---|---|
| `v2026.08.1` | Import du 13/08 corrigé : P0 sécurité, contrôle d'accès, modules restaurés, uploads authentifiés, déploiement assaini, rôles/workflows, qualité/UX |
| `v2026.08.2` | + module uploads versionné (piège `.gitignore`) et réconcilié : périmètre par document à la signature, compatibilité frontend |
| `v2026.08.3` | + runbooks consolidés, README — **version de référence** |
