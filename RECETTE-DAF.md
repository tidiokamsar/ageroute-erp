# RECETTE DAF — Validation des règles financières A1-A10

**Date** : ______________ · **DAF** : ______________ · **DSI** : ______________ · **Statut** : ☐ EN COURS ☐ VALIDÉ ☐ AJOURNÉ

> Ce document guide la Direction Administrative et Financière dans la validation
> des règles de gestion paramétrables de l'ERP AGEROUTE. Chaque scénario doit
> être exécuté et son résultat consigné. La recette est validée quand TOUS les
> scénarios sont PASSÉS ou explicitement DIFFÉRÉS avec motif.

---

## PRÉALABLES

| # | Condition | ☐ |
|---|---|---|
| 1 | L'application est déployée et accessible (`gestion.ageroute.gov.gn`) | ☐ |
| 2 | Un compte ADMIN et un compte DAF sont disponibles | ☐ |
| 3 | Un marché de test existe avec au moins un décompte en BROUILLON | ☐ |
| 4 | Le simulateur répond (`Paramétrage → Règles financières → Simuler`) | ☐ |
| 5 | Les 5 migrations SQL ont été appliquées (voir `backend/prisma/sql/`) | ☐ |

---

## GUIDE D'ACCÈS

```
1. Se connecter en ADMIN ou DAF
2. Menu latéral → Paramétrage §22
3. Cliquer sur l'onglet « Règles financières (A1-A10) »
4. La liste affiche les règles existantes (ou est vide — les valeurs
   par défaut du code s'appliquent tant qu'aucune règle n'est validée)
```

**Important** : tant qu'aucune règle n'est `APPROUVEE` dans le système,
le moteur de calcul utilise les **valeurs par défaut** (= formules
actuelles du code). Chaque règle que vous validez **change le calcul**
des nouveaux décomptes à compter de sa date d'effet. Les décomptes
existants ne sont JAMAIS modifiés rétroactivement (snapshot).

---

## NOTATION DES SCÉNARIOS

| Symbole | Signification |
|---|---|
| ✅ PASSÉ | Le comportement observé correspond à l'attendu |
| ❌ ÉCHOUÉ | Le comportement ne correspond pas — décrire l'écart |
| ⏸ DIFFÉRÉ | La règle nécessite un arbitrage supplémentaire — motif obligatoire |

---

## A1 — ASSIETTE DE LA RETENUE DE GARANTIE

**Enjeu** : la retenue de garantie (RG) est-elle calculée sur le TTC (usage actuel) ou sur le HT ?

### Scénario A1.1 — Simulation avec les valeurs par défaut

| Étape | Action | Attendu |
|---|---|---|
| 1 | Onglet « Règles financières » → bouton **Simuler** (icône fiole) sur la ligne `RG_ASSIETTE_RETENUE_GARANTIE`, ou sur n'importe quelle ligne | La modale de simulation s'ouvre |
| 2 | Saisir un montant HT de `1 000 000` GNF | — |
| 3 | Cliquer **Simuler** | Le tableau montre le calcul **AVANT** (= défauts actuels) |

**Résultat attendu AVANT** (avec montant HT = 1 000 000 GNF, taux 18/5/20) :

| Ligne | Formule | Montant |
|---|---|---|
| TVA | HT × 18 % | 180 000 |
| ARMP | HT × 0,6 % | 6 000 |
| TTC | HT + TVA + ARMP | 1 186 000 |
| Précompte | TTC × 9/118 | 90 458 |
| **Retenue garantie** | **TTC × 5 %** | **59 300** |
| Avance | HT × 20 % | 200 000 |
| Net à payer | TTC − précompte − RG − ARMP − avance | 830 242 |

**Résultat** : ☐ ✅ ☐ ❌ ☐ ⏸  Commentaire : ______________

### Scénario A1.2 — Arbitrage : basculer l'assiette sur le HT

| Étape | Action | Attendu |
|---|---|---|
| 1 | Dans la modale de simulation, changer la règle en `RG_ASSIETTE_RETENUE_GARANTIE = HT` | — |
| 2 | Cliquer **Simuler** | Le tableau montre **APRÈS** |

**Résultat attendu APRÈS** :

| Ligne | AVANT | APRÈS | Écart |
|---|---|---|---|
| Retenue garantie | 59 300 (TTC × 5 %) | **50 000** (HT × 5 %) | **−9 300** |
| Net à payer | 830 242 | **839 542** | **+9 300** |

**Questions pour la DAF** :
- L'assiette de la RG doit-elle rester sur le **TTC** (comportement actuel) ou passer sur le **HT** ?
- Quel est le fondement juridique ou contractuel de ce choix ?

**Décision DAF** : ☐ TTC (valeur actuelle) ☐ HT ☐ Différé — motif : ______________

### Scénario A1.3 — Validation de la règle (si décision = HT)

| Étape | Action | Attendu |
|---|---|---|
| 1 | **Nouvelle règle** → Clé : `RG_ASSIETTE_RETENUE_GARANTIE` | — |
| 2 | Valeur : `HT`, Portée : `Global`, Date d'effet : demain, Motif : `Arbitrage DAF du [date] — retour à l'assiette HT` | — |
| 3 | **Soumettre** | Statut passe à `SOUMISE` |
| 4 | Se connecter avec le **2ᵉ compte** (DG ou autre ADMIN/DAF ≠ soumetteur) | — |
| 5 | **Approuver** | Statut passe à `APPROUVEE` |
| 6 | Vérifier sur un nouveau décompte | La RG est calculée sur le HT |

**Résultat** : ☐ ✅ ☐ ❌ ☐ ⏸

---

## A2 — FORMULE DU PRÉCOMPTE TVA

**Enjeu** : comment le précompte TVA est-il calculé ?

### Scénario A2.1 — Vérifier la formule actuelle (PRORATA 9/118)

Avec HT = 1 000 000 GNF, vérifier que le précompte = round(1 186 000 × 9/118) = **90 458** GNF.

**Résultat** : ☐ ✅ ☐ ❌

### Scénario A2.2 — Arbitrage : alternatives

| Option | Formule | Résultat (HT=1M) |
|---|---|---|
| PRORATA_9_118 (actuel) | TTC × 9/118 | 90 458 |
| TAUX_HT | HT × 9 % | 90 000 |
| TAUX_TTC | TTC × 9 % | 106 740 |

**Décision DAF** : ☐ PRORATA_9_118 ☐ TAUX_HT ☐ TAUX_TTC ☐ Différé

---

## A3 — ARMP (ASSETTE ET INCLUSION)

**Enjeu** : la redevance ARMP (0,6 %) est-elle calculée sur le HT (actuel) ou le TTC, et incluse dans le TTC ?

### Scénario A3.1 — Comportement actuel

Avec HT = 1 000 000 GNF :
- ARMP = 1 000 000 × 0,6 % = **6 000** GNF (assiette HT)
- TTC = 1 000 000 + 180 000 + 6 000 = **1 186 000** GNF (ARMP incluse)
- Le net déduit l'ARMP : TTC − précompte − RG − ARMP − avance − pénalités

**Résultat** : ☐ ✅ ☐ ❌

### Scénario A3.2 — Arbitrage

| Question | Options | Décision |
|---|---|---|
| Assiette ARMP | ☐ HT (actuel) ☐ TTC | ______ |
| Incluse dans le TTC | ☐ Oui (actuel) ☐ Non | ______ |

---

## A4 — PLANCHER DU NET À PAYER ET REPORT DES PÉNALITÉS

**Enjeu** : un net à payer négatif est-il possible quand les pénalités dépassent le montant ?

### Scénario A4.1 — Comportement actuel (pas de plancher)

| Étape | Action | Attendu |
|---|---|---|
| 1 | Simuler avec HT = 1 000 000 et pénalités = 2 000 000 | Net à payer **négatif** (≈ −1 169 758) |

**Résultat** : ☐ ✅ ☐ ❌

### Scénario A4.2 — Arbitrage : activer le plancher à zéro

| Étape | Action | Attendu |
|---|---|---|
| 1 | Simuler avec `RG_NET_PLANCHER_ZERO = true` et pénalités = 2 000 000 | Net à payer = **0** |

**Questions pour la DAF** :
- Un net négatif doit-il être autorisé (report sur décompte suivant) ou borné à zéro ?
- Si borné à zéro, les pénalités excédentaires sont-elles reportées ou perdues ?

**Décision DAF** : ☐ Plancher à zéro ☐ Report sur décompte suivant ☐ Différer

---

## A5 — PÉNALITÉS DE RETARD (MODE ET PLAFOND)

**Enjeu** : les pénalités sont-elles saisies manuellement (actuel) ou calculées automatiquement ?

### Scénario A5.1 — Comportement actuel (mode SAISIE)

Les pénalités sont un montant saisi par ligne de décompte — aucune formule automatique.

**Résultat** : ☐ ✅ ☐ ❌

### Scénario A5.2 — Arbitrage : activer le mode FORMULE

Avec `RG_PENALITE_MODE = FORMULE` et un montant HT de 3 000 000 GNF :

| Jours de retard | Calcul (1/3000e) | Plafond 10 % | Pénalité retenue |
|---|---|---|---|
| 30 | 3 000 000 × 30/3000 = 30 000 | < 300 000 | 30 000 |
| 300 | 3 000 000 × 300/3000 = 300 000 | = 300 000 | 300 000 |
| 1000 | 3 000 000 × 1000/3000 = 1 000 000 | > 300 000 | **300 000 (plafonné)** |

**Décision DAF** :
- Mode : ☐ SAISIE (actuel) ☐ FORMULE
- Taux journalier : ______ (usuel : 1/3000)
- Plafond : ______ % (usuel : 10 %)

---

## A6 — AVANCES (MODE ET NATURES)

**Enjeu** : l'avance est-elle unique (actuel) ou divisée en démarrage + approvisionnement ?

### Scénario A6.1 — Comportement actuel (mode UNIQUE, 20 %)

Avance = HT × 20 % = 200 000 GNF (pour HT = 1M).

**Résultat** : ☐ ✅ ☐ ❌

### Scénario A6.2 — Arbitrage : deux natures

Avec `RG_AVANCE_MODE = DEMARRAGE_APPRO` :
- Démarrage : HT × 15 % = 150 000
- Approvisionnement : HT × 10 % = 100 000
- Total avance : **250 000** (au lieu de 200 000 en mode unique)

**Décision DAF** :
- Mode : ☐ UNIQUE ☐ DEMARRAGE_APPRO
- Si DEMARRAGE_APPRO : taux démarrage = ______ %, taux appro = ______ %

---

## A7 — MODE D'ARRONDI

**Enjeu** : comment arrondir les montants intermédiaires au franc GNF ?

### Scénario A7.1 — Les trois modes

Avec HT = 3 GNF et TVA à 18 % → 0,54 GNF :

| Mode | TVA calculée |
|---|---|
| FRANC_PROCHE (actuel) | 1 (0,54 arrondi au plus proche) |
| FRANC_INF | 0 |
| FRANC_SUP | 1 |

**Décision DAF** : ☐ FRANC_PROCHE (actuel) ☐ FRANC_INF ☐ FRANC_SUP

---

## A8 — SÉPARATION ORDONNATEUR / COMPTABLE

**Enjeu** : le même rôle peut-il liquider ET ordonnancer ?

### Scénario A8.1 — Vérifier les matrices actuelles

| Fonction | Rôles autorisés (défaut) |
|---|---|
| LIQUIDATION | ADMIN, DMC, MISSION, ENTREPRISE |
| ORDONNANCEMENT | ADMIN, DAF |
| PAIEMENT | ADMIN, DAF |

**Chevauchement actuel** : DAF n'apparaît pas en LIQUIDATION → séparation déjà effective par défaut.

### Scénario A8.2 — Arbitrage : activer le contrôle automatique

Avec `WF_SEPARATION_ORD_COMPTABLE = true`, le système détecte tout rôle présent simultanément dans LIQUIDATION et ORDONNANCEMENT et le signale.

**Décision DAF** : ☐ Activer la séparation ☐ Maintenir le statut quo

---

## A9 — LIBELLÉS D'ÉTATS (différable)

**Enjeu** : unifier le vocabulaire des statuts (fin du doublon SOUMIS/DEPOSE).

**Ce point est cosmétique** — il ne change aucun calcul. Il peut être différé sans risque.

**Décision DAF** : ☐ Traiter maintenant ☐ Différer (priorité basse)

---

## A10 — SEUILS DE CONFORMITÉ ET PONDÉRATIONS

**Enjeu** : les seuils du score de conformité entreprise (70/40) et les poids des 6 critères sont-ils corrects ?

### Scénario A10.1 — Vérifier les valeurs actuelles

| Critère | Poids actuel | Poids proposé (DAF) |
|---|---|---|
| NIF | 15 | ______ |
| TVA | 15 | ______ |
| Régularité fiscale | 20 | ______ |
| Régularité sociale | 15 | ______ |
| Documents légaux | 20 | ______ |
| Caution bancaire | 15 | ______ |
| **Total** | **100** | **______** |

| Seuil | Valeur actuelle | Valeur proposée (DAF) |
|---|---|---|
| CONFORME | ≥ 70 | ≥ ______ |
| A_REGULARISER | 40-69 | ______ |
| BLOQUE | < 40 | < ______ |

**Décision DAF** : ☐ Maintenir ☐ Modifier (spécifier ci-dessus)

---

## SYNTHÈSE DES ARBITRAGES

| Règle | Décision DAF | Valeur retenue | Date d'effet |
|---|---|---|---|
| A1 Assiette RG | ______ | ______ | ______ |
| A2 Formule précompte | ______ | ______ | ______ |
| A3 ARMP (assiette + inclusion) | ______ | ______ | ______ |
| A4 Plancher net | ______ | ______ | ______ |
| A5 Pénalités (mode + plafond) | ______ | ______ | ______ |
| A6 Avances (mode + taux) | ______ | ______ | ______ |
| A7 Arrondi | ______ | ______ | ______ |
| A8 Séparation | ______ | ______ | ______ |
| A9 Libellés | ______ | ______ | ______ |
| A10 Conformité (seuils + poids) | ______ | ______ | ______ |

---

## PROCÉDURE DE VALIDATION DES RÈGLES (RÉSUMÉ)

```
1. ADMIN/DAF → Paramétrage → Règles financières → Nouvelle règle
2. Choisir la clé (ex: RG_ASSIETTE_RETENUE_GARANTIE)
3. Saisir la valeur arbitée (ex: HT)
4. Portée : Global (ou par bailleur/type/marché si nécessaire)
5. Date d'effet : demain (jamais dans le passé)
6. Motif : description de l'arbitrage (min 10 caractères)
7. → BROUILLON
8. Cliquer « Soumettre » → SOUMISE
9. Un AUTRE utilisateur (DG ou autre ADMIN/DAF) clique « Approuver »
10. → APPROUVEE : la règle est ACTIVE à sa date d'effet
11. Vérifier sur un nouveau décompte que le calcul change
12. Si satisfait : « Geler » pour verrouiller définitivement
```

---

## PV DE RECETTE

### Résultats

| Règle | Scénario | Résultat | Commentaire |
|---|---|---|---|
| A1 | A1.1 Défauts | ☐ ✅ ☐ ❌ | |
| A1 | A1.2 Simulation | ☐ ✅ ☐ ❌ | |
| A1 | A1.3 Validation | ☐ ✅ ☐ ❌ | |
| A2 | A2.1 Formule | ☐ ✅ ☐ ❌ | |
| A3 | A3.1 Comportement | ☐ ✅ ☐ ❌ | |
| A4 | A4.1 Net négatif | ☐ ✅ ☐ ❌ | |
| A4 | A4.2 Plancher | ☐ ✅ ☐ ❌ | |
| A5 | A5.1 Saisie | ☐ ✅ ☐ ❌ | |
| A6 | A6.1 Unique | ☐ ✅ ☐ ❌ | |
| A7 | A7.1 Arrondis | ☐ ✅ ☐ ❌ | |
| A8 | A8.1 Matrices | ☐ ✅ ☐ ❌ | |
| A10 | A10.1 Seuils | ☐ ✅ ☐ ❌ | |

### Décision finale

☐ **REÇETTE VALIDÉE** — toutes les règles sont arbitrées et appliquées

☐ **REÇETTE PARTIELLEMENT VALIDÉE** — les règles marquées DIFFÉRÉES seront arbitrées ultérieurement

☐ **REÇETTE AJOURNÉE** — motif : ______________________________

### Signatures

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| DAF (ordonnateur) | | | |
| DG (validateur) | | | |
| DSI (technique) | | | |

---

## ANNEXE — COMMANDES DE VÉRIFICATION TECHNIQUE (pour la DSI)

```bash
# Vérifier que les tables de règles existent
docker exec erp-db psql -U erpuser -d erp_ageroute -c '\d regle_gestion'

# Vérifier les règles actives
docker exec erp-db psql -U erpuser -d erp_ageroute -c \
  "SELECT cle, valeur, statut, date_effet FROM regle_gestion WHERE statut='APPROUVEE' ORDER BY cle"

# Vérifier les snapshots sur les décomptes existants
docker exec erp-db psql -U erpuser -d erp_ageroute -c \
  "SELECT reference, regles_snapshot->>'methode' as methode FROM decomptes WHERE regles_snapshot IS NOT NULL LIMIT 5"

# Tester le simulateur via l'API
curl -X POST http://localhost:4001/api/parametrage/regles/simuler \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"montantHtGnf": 1000000, "regles": {"RG_ASSIETTE_RETENUE_GARANTIE": "HT"}}'
```
