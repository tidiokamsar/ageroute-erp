# Plan de développement — Paramétrage administrateur des règles A1 → A10

**Date** : 18/08/2026 · **Base** : master `v2026.08.4`
**Objet** : rendre les 10 points d'arbitrage de la revue experte (A1-A10,
`REVUE-EXPERTE-CDC-ET-FONCTIONNELLE-2026-08-18.md`) configurables **depuis le
module Paramétrage §22** de l'application, sans redéploiement ni modification
de code.
**Principe directeur** : à la livraison, **les valeurs par défaut reproduisent
exactement le comportement actuel** (zéro régression au déploiement) ; les
arbitrages DAF/DMP/DGI deviennent des changements de valeurs, datés et tracés.

---

## 1. Architecture cible

### 1.1 Modèle de données — registre des règles de gestion

Nouvelle table dédiée (le `parametres` existant reste pour les réglages
techniques SLA) — migration SQL manuelle `backend/prisma/sql/` (jamais db push) :

```sql
CREATE TABLE regle_gestion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle           TEXT NOT NULL,                -- ex. RG_ASSIETTE_RETENUE_GARANTIE
  categorie     TEXT NOT NULL,                -- FINANCE | WORKFLOW | ETATS | CONFORMITE
  libelle       TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL,                -- ENUM | NUMBER | BOOLEAN | MULTI | JSON
  options       JSONB,                        -- choix ENUM, min/max/pas, unité, aide
  portee        TEXT NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | BAILLEUR | TYPE_MARCHE | MARCHE
  portee_id     TEXT,                         -- identifiant quand portée ≠ GLOBAL
  valeur        TEXT NOT NULL,                -- toujours stockée en texte, typée à la lecture
  valeur_defaut TEXT NOT NULL,
  date_effet    DATE NOT NULL DEFAULT CURRENT_DATE,
  statut        TEXT NOT NULL DEFAULT 'BROUILLON', -- BROUILLON | VALIDE | ARCHIVE
  saisi_par     UUID REFERENCES users(id),
  valide_par    UUID REFERENCES users(id),
  valide_at     TIMESTAMP,
  motif         TEXT NOT NULL DEFAULT '',     -- obligatoire à la saisie
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (cle, portee, portee_id, date_effet, version)
);
CREATE INDEX regle_gestion_resolution_idx
  ON regle_gestion (cle, portee, portee_id, date_effet DESC);

-- Historique immuable (append-only) — alimenté par l'application à chaque
-- changement de valeur ; c'est la pièce d'audit exigée par la §3.4/§19.
CREATE TABLE regle_gestion_historique (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regle_id      UUID NOT NULL REFERENCES regle_gestion(id),
  cle           TEXT NOT NULL,
  ancienne      TEXT,
  nouvelle      TEXT NOT NULL,
  date_effet    DATE NOT NULL,
  saisi_par     UUID NOT NULL,
  valide_par    UUID,
  motif         TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);
```

`schema.prisma` : modèles `RegleGestion` / `RegleGestionHistorique` associés
(le client se régénère au build ; SQL appliqué via psql après `pg_dump`).

### 1.2 Moteur de règles — `backend/src/lib/regles.ts`

- `chargerRegles({ dateRef, bailleur?, typeMarche?, marcheId? })` :
  résolution **du spécifique au général** — MARCHE > TYPE_MARCHE > BAILLEUR >
  GLOBAL — parmi les règles `VALIDE` dont `date_effet ≤ dateRef`, version la
  plus récente ; retourne un objet typé `ReglesFinancieres` (zod-validé).
- **Cache** mémoire 60 s par clé de résolution, invalidé par toute écriture
  (mono-instance aujourd'hui ; note pour un futur multi-instances : pub/sub).
- `calculDecompte(montants, regles)` : la fonction existante devient **pure et
  paramétrée** — arithmétique **entière** (multiplier avant diviser) et mode
  d'arrondi `RG_ARRONDI_MODE` ; plus aucune constante financière dans le code.
- **Rejouabilité (F-DE1)** : chaque décompte persiste un **instantané des
  règles** qui ont servi à son calcul (`reglesSnapshot JSONB` sur le décompte)
  → tout recalcul d'audit reproduit le résultat d'origine, même après
  changement de paramètres.
- **Gel** : blocage des modifications FINANCE si un décompte de la période
  concernée est en circuit (`statut` non terminal), sauf dérogation DG tracée.

### 1.3 API (module parametrage étendu, ADMIN)

| Route | Rôle | Objet |
|---|---|---|
| `GET  /api/parametrage/regles?categorie=&portee=` | ADMIN | liste + historique |
| `POST /api/parametrage/regles` | ADMIN | création/modification → statut BROUILLON (motif obligatoire) |
| `POST /api/parametrage/regles/:id/valider` | DAF ou ADMIN (≠ saisisseur) | **quatre yeux** → VALIDE, date d'effet |
| `POST /api/parametrage/regles/simuler` | ADMIN, DAF | calcul d'un décompte d'exemple ligne à ligne avec un jeu de règles donné — **avant** application |
| `GET  /api/parametrage/regles/effectives?date=&bailleur=&marche=` | ADMIN | règles résolues à une date (rejeu) |

Chaque écriture → `logAudit` + ligne d'historique append-only.

### 1.4 UI — extension de ParametragePage (§22)

Quatre onglets, catégories du registre :

1. **« Règles financières » (A1-A7)** — cartes par règle : valeur courante,
   portée (Global / par bailleur / par type de marché / par marché), date
   d'effet, **formule affichée en clair avec les valeurs actives** (ex. :
   « Retenue de garantie = TTC × 5 % — assiette : TTC »), champ motif
   obligatoire, bouton **Simuler** (compare avant/après sur un montant
   d'exemple), statut BROUILLON → **Valider (DAF)** ; historique consultable
   (qui, quand, quoi, motif).
2. **« Circuits & rôles » (A8)** — matrice liquider/ordonnancer/payer par
   rôle, avec contrôle de séparation ordonnateur-comptable à l'enregistrement.
3. **« Libellés d'états » (A9)** — mapping technique ↔ libellé officiel
   (fin du doublon SOUMIS/DEPOSE : le code garde ses états, l'UI affiche le
   vocabulaire arbitré).
4. **« Conformité » (A10)** — critères du registre documentaire, durées de
   validité, pondérations du score, période de cure.

## 2. Le registre A1-A10 → clés de paramètres

| # | Clé (préfixe RG_) | Type / options | Défaut (= comportement actuel) | Portées possibles | Garde-fou |
|---|---|---|---|---|---|
| A1 | `RG_ASSIETTE_RETENUE_GARANTIE` | ENUM TTC/HT | **TTC** | GLOBAL, BAILLEUR, TYPE_MARCHE, MARCHE | 4 yeux + simulation |
| A1 | `RG_TAUX_RETENUE_GARANTIE` | NUMBER 0-100 % | 5 (déjà par marché) | idem | 0 ≤ v ≤ 20 |
| A2 | `RG_FORMULE_PRECOMPTE_TVA` | ENUM PRORATA_9_118 / TAUX_HT / TAUX_TTC | **PRORATA_9_118** | idem | 4 yeux |
| A2 | `RG_TAUX_PRECOMPTE_HT` | NUMBER % | 9 | idem | 0 ≤ v ≤ 20 |
| A3 | `RG_TAUX_ARMP` | NUMBER % | 0,6 | idem | 0 ≤ v ≤ 2 |
| A3 | `RG_ARMP_ASSIETTE` + `RG_ARMP_INCLUSE_TTC` | ENUM HT / BOOLEAN | HT / true | idem | 4 yeux |
| A4 | `RG_NET_PLANCHER_ZERO` | BOOLEAN | **false** (actuel) | idem | 4 yeux + DAF |
| A4 | `RG_REPORT_PENALITES` | BOOLEAN | false | idem | lié au précédent |
| A5 | `RG_PENALITE_ASSIETTE` | ENUM HT/TTC/MONTANT_MARCHE | MONTANT_MARCHE | idem | — |
| A5 | `RG_PENALITE_TAUX_JOURNALIER` | NUMBER (1/x) | 1/3000 | idem | > 0 |
| A5 | `RG_PENALITE_PLAFOND_PCT` | NUMBER % | 100 (illimité = actuel) | idem | 0 < v ≤ 25 |
| A6 | `RG_AVANCE_MODE` | ENUM UNIQUE / DEMARRAGE_APPRO | **UNIQUE** | idem | — |
| A6 | `RG_TAUX_AVANCE_{DEMARRAGE,APPRO}` | NUMBER % | 20 / — | idem | somme ≤ plafond code |
| A7 | `RG_ARRONDI_MODE` | ENUM FRANC_PROCHE/INF/SUP | **FRANC_PROCHE** | GLOBAL | global seul |
| A8 | `WF_ROLES_{LIQUIDATION,ORDONNANCEMENT,PAIEMENT}` | MULTI(rôles) | rôles actuels | GLOBAL | séparation forcée |
| A8 | `WF_SEPARATION_ORD_COMPTABLE` | BOOLEAN | false | GLOBAL | si true : contrôle à l'enregistrement |
| A9 | `ETQ_MAPPINGS` | JSON | identité | GLOBAL | aperçu avant application |
| A10 | `CF_CRITERES` | JSON (critère, durée validité j, obligatoire) | critères actuels | GLOBAL | — |
| A10 | `CF_SCORE_PONDERATIONS` + `CF_CURE_JOURS` | JSON / NUMBER | actuel / 0 | GLOBAL | cure ≤ 60 j |

## 3. Phases de développement

| Phase | Durée estimée | Contenu | Livrables vérifiables |
|---|---|---|---|
| **P0 — Socle** | 5-7 j | SQL + modèles Prisma, `lib/regles.ts` (résolution, cache, invalidation), API CRUD + validation 4 yeux + simulation, squelette UI (onglet FINANCE), seed des valeurs par défaut | `pg_dump` + migration OK ; GET/POST/valider testés ; audit + historique alimentés |
| **P1 — Moteur financier A1-A7** | 8-10 j | Refonte de `calculDecompte` en **entier pur paramétré**, suppression des constantes, snapshot des règles par décompte, simulation ligne à ligne, **tests matriciels** (A1×A2×A3 : 12 combinaisons ; bornes A4/A5 ; modes A6/A7), recalcul identique des décomptes existants avec les défauts | `npm test` étendu (~+60 cas) ; rejeu des 6 décomptes du pilote → montants identiques à l'identique près ; journal de calcul par décompte |
| **P2 — Circuits & états A8-A9** | 5-6 j | Consommation des matrices de rôles par workflow/circuit-financier/paiements (contrôles runtime), mapping d'états consommé par le frontend (libellés officiels), UI onglets 2-3 | tests de rejet (un rôle retiré de LIQUIDATION ne peut plus valider) ; libellés arbitrés visibles partout |
| **P3 — Conformité A10** | 4-5 j | Moteur de score consommant `CF_CRITERES`/pondérations/cure, relances d'expiration paramétrées, UI onglet 4 | recalcul des scores inchangé avec défauts ; cure testée de bout en bout sur un compte de test |
| **Recette DAF** | 2 j | Atelier d'arbitrage A1-A10 avec le simulateur, saisie des valeurs arbitrées, période d'observation | PV d'arbitrage ; règles VALIDE avec motif ; simulation avant/après archivée |

**Total : ~25-30 jours-homme**, sans interruption du pilote (défauts =
comportement actuel à chaque livraison de phase).

## 4. Vérification et non-régression

1. **Identité aux défauts** : les 6 décomptes existants recalculés avec les
   règles par défaut donnent des montants strictement identiques (test
   automatique sur données anonymisées).
2. **Matrice de tests** : chaque ENUM × chaque borne, exécutée dans la suite
   Node 20 (`run-tests.mjs`).
3. **Quatre yeux** : un changement FINANCE sans validation DAF n'est jamais
   actif (test).
4. **Traçabilité** : toute modification d'une règle produit ligne
   d'historique + audit (test).
5. **Gel de période** : règle FINANCE modifiable seulement si aucun décompte
   non terminal n'utilise l'ancienne valeur en cours de circuit (test).

## 5. Risques et points d'attention

| Risque | Parade |
|---|---|
| Dérive de valeurs non maîtrisée | plages min/max par clé, simulation obligatoire consultable, 4 yeux, motifs |
| Règles changées pendant un circuit | gel + snapshot par décompte (le circuit finit sur les règles de son dépôt) |
| Cache obsolète | TTL court + invalidation à l'écriture ; mono-instance aujourd'hui |
| Perte de l'historique | table append-only + backup quotidien existant (base) |
| Confusion version/état | les étapes métier ne lisent que des règles VALIDE à date d'effet |

## 6. Séquence de livraison

Chaque phase = une branche + un tag (`fix(p0-regles-socle)` …), fusion dans
`master` après revue, SQL appliqué par psql après `pg_dump`, valeurs par
défaut seedées à la migration — l'application démarre identique à avant,
prête à être arbitrée.
