# Programme de travail multi-agents — Paramétrage A1 → A10

**Date** : 18/08/2026 · **Références** : `REVUE-EXPERTE-CDC-ET-FONCTIONNELLE-2026-08-18.md` (le quoi/pourquoi) · `PLAN-DEV-PARAMETRAGE-A1-A10.md` (l'architecture)
**Objet** : exécution étape par étape, par plusieurs agents, jusqu'à la recette DAF incluse.
**Règle d'or** : ce document et ses deux références dans le dépôt sont la **seule source de vérité**. Aucun agent ne travaille depuis une conversation — tout part du dépôt.

---

## 1. Acteurs et rôles

| Acteur | Rôle dans le programme |
|---|---|
| **ZCode** (architecte) | Socle (P0), moteur financier (P1), revue croisée de tous les lots, tags et releases |
| **Claude** (agent poste/serveur) | Relecture sécurité de chaque lot, lots UI désignés, intégration et exécution serveur, rejeu des tests en conditions Docker (Node 20) |
| **Codex** (agent poste) | Lots désignés sans dépendance avec le moteur (UI onglets, A9/A10, tests de matrice) |
| **DSI AGEROUTE (humain)** | Fusion des branches après revue, application SQL en production (pg_dump + psql), orchestration |
| **DAF / DMP / DGI (humains)** | Recette finale : atelier d'arbitrage A1-A10 avec le simulateur, validation 4 yeux des règles |

## 2. Protocole commun (imposé à chaque lot)

1. **Une branche par lot** : `feat/regles-<lot>` (ex. `feat/regles-l02-moteur`), créée depuis `master` à jour.
2. **Spécification = le prompt** : chaque lot ci-dessous est autoportant ; l'agent exécutant copie le bloc « PROMPT DU LOT » tel quel.
3. **Définition du fait (DoD) — non négociable** : `cd backend && npx tsc` 0 erreur ; `npm test` vert **sous Node 20** (`node scripts/run-tests.mjs`) ; `cd frontend && npm run build` OK si le lot touche le front ; le comportement par défaut reste **identique à l'existant** (test de non-régression fourni ou déjà vert).
4. **Relecture croisée avant fusion** : un agent différent de l'auteur relit (checklist : DoD, sécurité, cohérence avec PLAN-DEV §1-2, français des libellés).
5. **Convention release** : tag `v2026.MM.JJ-N` posé uniquement par l'architecte, sur l'état exactement validé ; le tableau §4 est mis à jour dans le même commit que la fusion.
6. **Interdits** (AGENTS.md) : jamais `prisma db push` ; jamais de formule financière en dur modifiée sans paramètre ; jamais de suppression d'audit.
7. **Relais consigné (JOURNAL-RELAIS.md)** — à la fin de CHAQUE lot, l'agent livreur ajoute en tête du journal, dans le même commit que sa livraison ou sa fusion : (a) son rapport de fin de lot (contenu, branche/commit, résultats de vérification, restes à faire), (b) **le prompt du prochain lot pour l'agent suivant**, autoportant et prêt à coller. L'agent suivant démarre uniquement depuis le dépôt et ce journal. Une entrée consignée ne se réécrit jamais — on la corrige par une entrée nouvelle.

## 3. Découpage en lots — spécifications autoportantes

### P0 — SOCLE (dépendances : aucune)

**L0.1 Données + moteur de résolution** — *statut : RÉALISÉ (voir §4)*
SQL `prisma/sql/2026-08-18-regles-gestion.sql` (tables `regle_gestion`,
`regle_gestion_historique`), modèles Prisma, `lib/regles.ts` (registre des
défauts = comportement actuel, résolution pure portée/date, cache 60 s,
invalidation), tests de résolution.

**L0.2 API CRUD + 4 yeux + historique**
> **PROMPT DU LOT L0.2** — Sur une branche `feat/regles-l02-api` depuis master :
> implémenter dans le module `parametrage` les routes
> `GET /api/parametrage/regles` (liste + dernière modification),
> `POST /api/parametrage/regles` (création/modification → BROUILLON, motif
> obligatoire ≥ 10 caractères, validation zod du type et des bornes options),
> `POST /api/parametrage/regles/:id/valider` (rôle DAF ou ADMIN **différent du
> saisisseur** → VALIDE ; écrit la ligne d'historique append-only).
> **Gel financier (fourni par L1.2 — à brancher ici)** : avant de passer VALIDE
> une règle de catégorie FINANCE, appeler
> `compterDecomptesEnCircuit(regle.portee, regle.porteeId)` puis
> `verifierGelFinancier(regle.categorie, n)` (module
> `backend/src/modules/decomptes/decomptes.regles.audit.ts`) ; si non autorisé
> → 409 avec le message. Après validation : `invaliderCacheRegles()`,
> conformément à PLAN-DEV-PARAMETRAGE §1.3. `requireAuth` + ADMIN sur tout le
> routeur, `logAudit` à chaque écriture, messages français. Ne rien appliquer
> au moteur de calcul (consommation = L1.1). DoD §2 + tests des rejets
> (motif court, auto-validation, type incohérent, **gel 409**).

**L0.3 Simulateur**
> **PROMPT DU LOT L0.3** — `POST /api/parametrage/regles/simuler` : corps
> { regles: Partial<Record<CléRegles,string>>, montantHt, tauxTva?, tauxRg?,
> tauxAvance? } → applique `resoudreRegles` par-dessus les défauts puis
> retourne le détail ligne à ligne du calcul (HT, TVA, ARMP, TTC, précompte,
> RG, avance, net) **avant/après** avec les formules en clair. Fonction de
> calcul pure partagée (pas de duplication). DoD §2 + tests : simulation avec
> défauts = valeurs actuelles du moteur ; A1=HT change uniquement la RG.

**L0.4 UI — onglet « Règles financières »** *(peut être mené en parallèle par Codex dès que L0.2 est fusionné)*
> **PROMPT DU LOT L0.4** — Étendre ParametragePage : onglet « Règles
> financières » listant les clés RG_* par catégorie, saisie typée selon
> `options` (ENUM=select, NUMBER=input borné, BOOLEAN=switch), portée
> (Global/Bailleur/Type/Marché), date d'effet, motif obligatoire, statut
> BROUILLON→VALIDE avec bouton Valider (visible DAF/ADMIN ≠ saisisseur),
> bouton Simuler (modal avant/après), historique dépliable par règle.
> Aucune touche au moteur de calcul. DoD §2 + build front.

### P1 — MOTEUR FINANCIER A1-A7 (dépend de L0.1)

**L1.1 Calcul paramétré + entier pur**
> **PROMPT DU LOT L1.1** — Refondre `calcDecompte` (decomptes.service) :
> signature `calcDecompte(montants, regles: ReglesEffectives)`, arithmétique
> **BigInt pure** (multiplier avant diviser, `RG_ARRONDI_MODE` : FRANC_PROCHE
> par défaut), toutes les constantes remplacées par les règles résolues
> (`chargerRegles` à la date du décompte). Interdiction de modifier une règle
> métier : les défauts doivent reproduire bit à bit les résultats actuels
> (test de non-régression sur les 11 cas existants + les 6 décomptes du
> pilote rejoués). DoD §2 + ~30 tests paramétrés (A1×A2×A3, bornes A4/A5,
> modes A6/A7).

**L1.2 Snapshot par décompte + gel**
> **PROMPT DU LOT L1.2** — Persister `reglesSnapshot Json?` sur Decompte à
> chaque calcul (SQL + schéma + écriture au calculate) ; endpoint de rejeu
> `GET /api/decomptes/:id/recalcul-audit` qui recalcule **avec le snapshot**
> et compare. Gel : refuser VALIDE d'une règle FINANCE si un décompte non
> terminal existe dont le marché correspond à la portée (409 explicatif).
> DoD §2 + tests.

**L1.3 Tests de matrice complets** *(parallélisable Codex)*
> **PROMPT DU LOT L1.3** — Étendre la suite : matrice combinatoire documentée
> (12 combinaisons A1×A2×A3 avec montants de référence y compris milliards
> GNF), bornes A4 (net négatif → comportement selon booléens), A5 (plafond
> pénalités), A6 (deux natures d'avance), A7 (trois arrondis). Tableau de
> couverture dans le rapport de lot. DoD §2.

### P2 — CIRCUITS & ÉTATS A8-A9 (dépend de L0.1 uniquement)

**L2.1 Matrices de rôles consommées au runtime**
> **PROMPT DU LOT L2.1** — `WF_ROLES_LIQUIDATION/ORDONNANCEMENT/PAIEMENT`
> (MULTI) et `WF_SEPARATION_ORD_COMPTABLE` consommés par workflow,
> circuit-financier et paiements **en plus** des rôles d'étape ; si
> séparation=true, contrôle à l'enregistrement qu'aucun utilisateur n'apparaît
> simultanément en LIQUIDATION et ORDONNANCEMENT (409). Défauts = rôles
> actuels → aucun changement comportemental. DoD §2 + tests de rejet.

**L2.2 Libellés d'états officiels (A9)** *(parallélisable Codex)*
> **PROMPT DU LOT L2.2** — `ETQ_MAPPINGS` (JSON technique→libellé officiel)
> exposé par `GET /api/parametrage/regles/effectives` ; frontend : helper
> unique `libelleStatut()` utilisé partout (fin des libellés en dur) ;
> défaut = libellés actuels. DoD §2 + build + vérif visuelle des badges.

### P3 — CONFORMITÉ A10 (dépend de L0.1)

**L3.1 Moteur de score paramétré**
> **PROMPT DU LOT L3.1** — `CF_CRITERES` (JSON : critère, durée de validité,
> obligatoire), `CF_SCORE_PONDERATIONS`, `CF_CURE_JOURS` consommés par
> conformite.service (relances d' expiration, période de cure avant blocage).
> Défauts = comportement actuel. DoD §2 + tests (expiration, cure, score).

**L3.2 UI onglets Circuits & états + Conformité** *(parallélisable Codex, dépend de L2.1/L3.1 fusionnés)*

**REC — Recette DAF (humain, 2 j)** : atelier avec le simulateur, arbitrages
A1-A10 saisis comme règles VALIDE avec motifs, PV signé, période
d'observation d'une quinzaine avant ouverture de l'exploitation réelle.

## 4. Tableau de suivi (mis à jour à chaque fusion)

| Lot | Branche | Auteur | Relecteur | Statut |
|---|---|---|---|---|
| L0.1 Socle données + moteur | `feat/regles-p0-socle` @ `7e79de3` | ZCode | Claude | **RÉALISÉ — relais N°1 consigné (JOURNAL-RELAIS.md), en attente de relecture** |
| L0.2 API CRUD + 4 yeux | — | Codex | ZCode | À faire |
| L0.3 Simulateur | `feat/regles-l03-simulateur` @ `28555b8` | ZCode | Claude | **RÉALISÉ — relais N°2 consigné, en attente de relecture** |
| L0.4 UI Règles financières | — | Codex | ZCode | À faire (après L0.2) |
| L1.1 Calcul paramétré | `feat/regles-l11-moteur` @ `4e07e7a` | ZCode | Claude | **RÉALISÉ — relais N°3 consigné, en attente de relecture** |
| L1.2 Snapshot + gel | `feat/regles-l12-snapshot` @ `5f97d11` | ZCode | Claude (spec update: L0.2) | **RÉALISÉ — relais N°4 consigné** |
| L1.3 Tests matrice | — | Codex | ZCode | Parallélisable |
| L2.1 Matrices rôles | — | ZCode | Claude | À faire |
| L2.2 Libellés états | — | Codex | ZCode | Parallélisable |
| L3.1 Score paramétré | — | ZCode | Codex | À faire |
| L3.2 UI onglets restants | — | Codex | ZCode | À faire |
| REC Recette DAF | — | DAF/DMP/DGI + DSI | — | Humain |
