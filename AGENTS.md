# ERP AGEROUTE Guinée — Brief pour agent de développement (Codex / Z.ai / Claude / autre)

> Ce fichier est le contrat de travail. **Lis-le entièrement avant toute modification.**
> Il vaut aussi comme `CLAUDE.md` / `.cursorrules` / instructions système.

---

## 1. Ce qu'est ce projet

ERP métier de l'**AGEROUTE Guinée** (Agence de Gestion des Routes, agence publique).
Il gère la chaîne : **Projets → Marchés → Attachements → Décomptes → Validation → Paiement**,
avec référentiel entreprises, score de conformité, workflow BPMN paramétrable par bailleur,
signature électronique, audit trail et intégration au géoportail routier.

C'est un système **financier public** : il calcule et ordonnance des paiements réels sur fonds
publics et fonds de bailleurs internationaux (Banque Mondiale, BAD, FER, Budget National).
Toute erreur de calcul ou de contrôle d'accès a une conséquence financière et juridique.

**En production** : https://gestion.ageroute.gov.gn (serveur 102.211.199.131, Docker + Traefik).
**État réel** : pilote avec données de démonstration (20 utilisateurs, 4 marchés, 6 décomptes).
Pas encore de production métier réelle → une fenêtre existe encore pour corriger le socle.

---

## 2. Stack

| Couche | Technologie |
|---|---|
| Backend | Node 20 (Debian slim) · Express · TypeScript · Prisma · PostgreSQL 16 |
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · React Router |
| Auth | JWT access + refresh (rotation), RBAC par rôle + override par module |
| Infra | Docker Compose, Traefik v3 (HTTPS Let's Encrypt), nginx pour le frontend |
| Tests | `node:test` via `tsx` — `npm test` |

Arborescence :
```
backend/src/
  app.ts                  montage des routes + middlewares
  config/env.ts           validation des variables d'env (zod)
  lib/                    prisma, jwt, audit, bigint, mailer, modules.catalog, affectations, delegations
  middleware/             auth, rbac, moduleAccess, error
  modules/<domaine>/      routes.ts · service.ts · schema.ts (zod)
  prisma/schema.prisma
frontend/src/
  pages/                  une page par module
  components/             layout (Sidebar, AppLayout), ui/ (Button, Modal, Toast…)
  lib/api.ts              client HTTP + gestion du token
```

---

## 3. RÈGLES ABSOLUES — ne jamais enfreindre

### 3.1 Base de données
- ❌ **JAMAIS `prisma db push`, surtout pas `--accept-data-loss`.**
  Les tables `bpmn_definitions`, `bpmn_steps`, `bpmn_instances`, `bpmn_actions`,
  `ref_troncons`, `ref_ouvrages`, `ref_inspections` sont **volontairement hors du schéma
  Prisma** (accédées via `prisma.$queryRaw`). `db push` veut systématiquement les
  supprimer → destruction de l'historique de workflow. C'est déjà arrivé.
- ✅ Pour changer le schéma : éditer `schema.prisma` (pour le client typé) **puis** appliquer
  le diff en **SQL direct** (`psql`). Le client se régénère au build du backend.
- ✅ Toujours faire un `pg_dump -Fc` avant toute opération de schéma.

### 3.2 Runtime
- ❌ **Pas d'image Alpine pour le backend** : Prisma y plante (`libssl.so.1.1` introuvable).
  Rester sur `node:20-slim` avec `binaryTargets = ["native","debian-openssl-3.0.x"]`.
- ❌ Ne pas retirer `import "./lib/bigint"` en première ligne de `app.ts` : sans ce patch de
  `BigInt.prototype.toJSON`, **tous** les endpoints renvoyant des montants plantent en 500.
- ⚠️ Traefik : le certresolver s'appelle `le` (pas `letsencrypt`) sur ce serveur.

### 3.3 Argent
- Les montants sont en **GNF** (franc guinéen), stockés en `BigInt`, **jamais en float**.
- Toute modification de `backend/src/modules/decomptes/decomptes.calc.ts` doit être
  accompagnée de tests et **validée fonctionnellement par la DAF** avant déploiement.
  Ne change pas une formule de ta propre initiative : signale-la, propose, attends l'accord.

### 3.4 Traçabilité
- Toute action métier sensible (création/validation/rejet de décompte, paiement, changement
  de rôle) doit produire une entrée d'audit via `logAudit()`. Ne jamais retirer un appel existant.
- Pas de suppression physique sur décomptes / paiements / audit : `deletedAt` (soft delete).

---

## 4. Mission demandée à l'agent

Par ordre de priorité. **Ne pas élargir le périmètre sans accord.**

### P0 — Sécurité (à traiter en premier, avant toute autre chose)
1. **Secrets JWT devinables.** Les secrets de production étaient des chaînes littérales
   parlantes (`ERP_AGEROUTE_JWT_SECRET_2024_...`). Un attaquant qui devine ce motif forge un
   JWT admin et prend le contrôle total. → Externaliser en `.env` (voir `.env.example`),
   générer des secrets aléatoires, et **invalider tous les tokens existants** à la rotation.
2. **Pièces jointes téléchargeables sans authentification.**
   `GET /api/uploads/files/:filename` n'a pas de `requireAuth`. Le commentaire invoque des
   « noms non devinables », mais le nom est `<nomOriginal>_<timestamp>_<5 car base36>` — c'est
   de l'obscurité, pas du contrôle d'accès. Ces fichiers sont des contrats, PV et décomptes
   d'une agence publique. → Exiger l'authentification et vérifier le périmètre de l'utilisateur.
3. **En-têtes de sécurité absents** sur le frontend (`nginx.conf` ne pose ni HSTS, ni CSP,
   ni `X-Frame-Options`, ni `X-Content-Type-Options`). `helmet` ne couvre que `/api`.
4. Revue du contrôle d'accès de bout en bout : `requireAuth` + `requireRole` +
   `checkModuleAccess` + périmètre `affectations` doivent être cohérents sur **chaque** route
   d'écriture. Attention au piège connu : dans `app.ts`, `requireAuth` doit précéder
   `checkModuleAccess`, sinon `req.user` est indéfini → 401 pour tout le monde.

### P1 — Perte de données
5. **Le répertoire `/app/uploads` n'est pas un volume Docker** (`Mounts: []` vérifié sur le
   conteneur en production). Chaque `docker compose build && up` **détruit toutes les pièces
   jointes**. → Déclarer un volume nommé, et l'inclure dans la sauvegarde (le script de backup
   actuel ne sauvegarde que la base).

### P2 — Exactitude financière
6. `decomptes.calc.ts` convertit les `BigInt` en `Number` pour les multiplications
   (`Number(montantPeriode) * taux / 100`). Sur des montants en GNF (milliards à milliers de
   milliards), cela introduit de l'arithmétique flottante sur de l'argent. → Réécrire en
   arithmétique entière pure (multiplier avant de diviser, règle d'arrondi explicite au franc).
7. `netAPayer` n'est pas borné à zéro : des pénalités supérieures au montant produisent un net
   négatif. Clarifier la règle de gestion (report sur décompte suivant ?) et l'implémenter.
8. Points à **faire valider par la DAF** avant tout changement (ne pas trancher seul) :
   la retenue de garantie et le précompte TVA sont calculés sur le **TTC** (TVA + ARMP
   incluses) et non sur le HT ; l'ARMP est ajoutée au TTC puis redéduite du net.

### P3 — Qualité et pérennité
9. Couverture de tests : seule la formule de décompte est testée (7 cas). Étendre aux règles
   bloquantes (marché actif, entreprise conforme, attachement validé, plafond marché+avenants)
   et aux transitions de workflow.
10. Pages frontend très volumineuses (`AttachementsPage.tsx` 1 504 lignes,
    `MarchesPage.tsx` 1 472, `DecomptesPage.tsx` 1 254). Découper en composants et hooks,
    sans changer le comportement.
11. `signature-audit.routes.ts` utilise `$queryRawUnsafe` (lignes ~106 et ~121) : vérifier
    qu'aucune entrée utilisateur n'atteint la requête, ou passer en `$queryRaw` paramétré.

---

## 5. Méthode de travail imposée

1. **Une branche par lot** (`fix/p0-secrets`, `fix/p1-uploads-volume`, …). Pas de gros commit fourre-tout.
2. **Aucun accès direct au serveur de production.** Tu travailles sur le dépôt ; le déploiement
   est fait par l'équipe AGEROUTE après relecture.
3. Avant de proposer un correctif : `npm test` doit passer, et le build backend + frontend doit réussir.
4. Pour chaque correctif, indiquer : le problème, la cause, le correctif, comment le vérifier.
5. Si une correction impose un changement de schéma, fournir **le SQL de migration** à part
   (voir §3.1) — jamais une instruction `db push`.
6. Ne pas introduire de nouvelle dépendance sans justification écrite (le système doit vivre 10 ans).
7. Le produit est en **français** : libellés, messages d'erreur et documentation en français.

---

## 6. Ce que l'agent ne doit PAS faire

- Toucher aux données de production ou au serveur.
- Modifier une formule financière sans validation métier.
- Réécrire l'architecture (migration vers un autre framework, autre ORM, microservices…).
- Supprimer du code d'audit ou de contrôle d'accès pour « simplifier ».
- Committer un secret réel, une URL interne avec identifiants, ou un dump de base.
