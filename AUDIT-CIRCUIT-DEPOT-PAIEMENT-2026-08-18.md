# Audit du circuit Dépôt → Attachements → Validation → Paiement BCRG

**Date** : 18/08/2026 · **Méthode** : lecture exhaustive du code (toutes les routes, les deux moteurs de workflow, le circuit financier, les paiements) — pas de test à blanc sur données de prod.

---

## Cartographie AS-IS (ce que le code fait réellement)

```
ENTREPRISE (Portail)                      AGENT INTERNE
     │                                         │
     ├─ POST /portail/deposer-decompte         ├─ POST /decomptes (BROUILLON)
     │    └─ statut: SOUMIS, BPMN instance      │
     │    ⚠ AUCUN attachement lié               ├─ POST /decomptes/:id/lignes
     │                                          │
     ├─ POST /attachements (BROUILLON)         │
     │    └─ POST /:id/soumettre → SOUMIS      │
     │         ├─ valider-mission (MISSION)    │
     │         └─ valider-technique (TECHNIQUE) │
     │              └─ VALIDE                  │
     │                                         │
     ▼                                         ▼
  ┌──────────────────────────────────────────────────┐
  │ MOTEUR BPMN (portail)     MOTEUR WORKFLOW (interne)│
  │ MISSION→…→DG             MISSION→TECH→UGP→DMC→DAF→DG│
  │ Approuvé → statut VALIDE_DG                      │
  │ ⚠ NE DÉCLENCHE PAS LE CIRCUIT FINANCIER          │
  └──────────────────────────────────────────────────┘
     │ (interne seulement, via workflow DG approval)
     ▼
  CIRCUIT FINANCIER (créé par workflow DG ou manuellement par ADMIN/DG)
     Étapes: Validation DG → FER/BUDGET/BAILLEUR → DNTCP → BCRG → Paiement(DAF)
     Chaque étape: VALIDE/REJETÉ par roleOuService
  ┌──────────────────────────────────────────────────┐
  │ ⚠ POST /api/paiements (DAF/ADMIN) :              │
  │   - statut requis = "VALIDE" ou "PAYE" (!)       │
  │   - pas de contrôle déjà-payé → double paiement  │
  │   - pas de plafond montant vs netAPayer          │
  │   - pas de vérif circuit à l'étape "Paiement"    │
  │   - référence virement optionnelle               │
  │   → marque décompte PAYE immédiatement           │
  └──────────────────────────────────────────────────┘
```

---

## Failles et incohérences identifiées

### CRITIQUES (peuvent coûter de l'argent réel)

| # | Faille | Preuve dans le code | Impact |
|---|---|---|---|
| **F1** | **Double paiement** — `POST /api/paiements` ne vérifie pas si le décompte est déjà payé. Statut requis: `"VALIDE"` ou `"PAYE"` — payer un décompte PAYE est explicitement permis. | `paiements.routes.ts:43` : `["VALIDE","PAYE"].includes(decompte.statut)` | La DAF peut enregistrer N paiements pour le même décompte. Chaque appel crée un record de paiement réel. |
| **F2** | **Pas de plafond de montant** — le paiement peut dépasser le net à payer du décompte. | `schema.parse(req.body)` → `create({ data })` sans comparaison à `netAPayer` | Un paiement de 10× le montant du décompte passe. |
| **F3** | **Incohérence de statut** — le workflow passe par `VALIDE_DG` → `EN_CIRCUIT_FINANCIER` → `ORDONNANCE`, mais le paiement exige `VALIDE` (le statut rétro-compat jamais utilisé). Un décompte qui suit le circuit normal **ne peut pas être payé** sans intervention manuelle sur le statut. | `paiements.routes.ts:43` vs `workflow.routes.ts:167,180` | Soit le paiement est bloqué (incohérence), soit quelqu'un court-circuite en modifiant le statut directement (perte de traçabilité). |
| **F4** | **Circuit BPMN ne déclenche pas le circuit financier** — l'approbation DG via le portail met le statut à `VALIDE_DG` puis **s'arrête**. Aucun circuit financier n'est créé. | `bpmn.routes.ts` : grep `circuitFinancier` = 0 occurrence | Les décomptes déposés par les entreprises via le portail **n'entrent jamais dans le circuit de paiement**. Bloqués à VALIDE_DG. |
| **F5** | **Attachements non liés au dépôt** — le portail `deposer-decompte` crée un décompte sans vérifier qu'un attachement validé existe pour la période. | `portail.routes.ts` : aucun référence à `attachement.findMany` ou similaire dans `deposer-decompte` | Un décompte peut être déposé, validé et payé **sans pièce justificative**. |

### MAJEURES (incohérences de processus)

| # | Faille | Preuve | Impact |
|---|---|---|---|
| **F6** | **Le circuit financier inclut une étape "Validation DG"** comme étape 1, alors que le circuit n'est déclenché qu'APRÈS validation DG par le workflow. La DG valide donc deux fois. | `circuit-financier.routes.ts:17` : `{ ordre:1, nom:"Validation DG" }` | Étape redondante → confusion, délais inutiles |
| **F7** | **Paiement non lié au circuit** — `POST /api/paiements` peut être appelé même si le circuit financier est à l'étape 2/6 (BCRG pas encore validé). | Aucun check sur `circuitFinancier.etapes` dans le handler paiement | L'argent peut partir avant que la BCRG ait validé. |
| **F8** | **Étape "Paiement" du circuit = DAF, pas BCRG** — le dernier maillon du circuit (l'exécution réelle du virement) est assigné au DAF, pas à la Banque Centrale qui exécute le transfert. | `ETAPES_FER: { ordre:6, nom:"Paiement", roleOuService:"DAF" }` | La BCRG n'a aucun rôle dans l'exécution du paiement dans le système. |
| **F9** | **Référence de virement optionnelle** — le paiement peut être enregistré sans référence bancaire. Impossible de rapprocher avec un avis de débit. | `schema` : `reference: z.string().optional()` | Pas de rapprochement bancaire possible. |
| **F10** | **Montant et date réels du virement non enregistrés** — le paiement stocke `montantGnf` et `dateExecution` saisis par la DAF, pas confirmés par la banque. | Pas de champ `confirmeParBanque`, `dateReelleTransfert`, `montantReelGnf` | Le paiement système peut différer du virement réel sans détection. |

### MINEURES

| # | Faille | Impact |
|---|---|---|
| F11 | Cumul des paiements vs netAPayer non suivi — un décompte de 100 M peut recevoir un paiement de 60 M puis un autre de 60 M (total 120 M > net). | Suivi imprécis |
| F12 | Le workflow interne et le BPMN ont des étapes différentes (le BPMN n'a pas UGP/DMC/DAF selon le seed) — la même décision peut être validée différemment selon le canal de dépôt. | Processus incohérent selon le canal |
| F13 | `updateEntityStatut` du BPMN silencieusement ignore les erreurs (`catch {}`) — un échec de changement de statut n'est jamais détecté. | Silences dangereux |

---

## Solutions proposées

### Correctifs critiques immédiats (implémentés dans cette branche)

| Faille | Solution | Implémentation |
|---|---|---|
| **F1+F2** | Garde-fous sur `POST /api/paiements` : vérifier le cumul des paiements existants, refuser si le nouveau paiement ferait dépasser le net à payer. | Ajout de logique de contrôle |
| **F3** | Élargir les statuts acceptés à `VALIDE, VALIDE_DG, EN_CIRCUIT_FINANCIER, ORDONNANCE` + refuser `PAYE` si le cumul atteint déjà le net. | Correction de l'incohérence |
| **F4** | Déclencher le circuit financier dans le BPMN après approbation finale DECOMPTE. | Même logique que le workflow interne |
| **F6** | Retirer l'étape "Validation DG" du circuit financier (déjà validée en amont). | Les étapes commencent à FER/BUDGET/BAILLEUR |
| **F7** | Vérifier que le circuit financier est à l'étape "Paiement" ou terminé avant d'autoriser `POST /paiements`. | Nouveau check |
| **F9** | Rendre la référence de virement obligatoire. | `z.string().min(3)` au lieu de `.optional()` |

### Améliorations structurantes (proposées, à arbitrer DAF/BCRG)

| Faille | Solution | Effort |
|---|---|---|
| **F5** | Exiger au moins un attachement VALIDÉ pour la période du décompte avant soumission au circuit | M |
| **F8** | Étape "Paiement" du circuit → rôle BCRG (pas DAF) ; le DAF prépare, la BCRG confirme l'exécution | M |
| **F10** | Champs `montantReelGnf`, `dateReelleTransfert`, `confirmePar` sur Paiement — confirmés par BCRG | S |
| **F11** | Afficher le solde payé / restant sur chaque décompte (frontend) | S |
| **F12** | Unifier les définitions d'étapes BPMN et workflow pour les décomptes (même circuit quel que soit le canal de dépôt) | L |

---

## Vérification des correctifs immédiats

Après implémentation :
- `npx tsc` 0 erreur
- `npm test` — tests existants + nouveaux tests de garde-fous
- Build frontend OK
- Recette manuelle : déposer un décompte via portail → vérifier le circuit se déclenche après DG ; tenter un paiement > net à payer → refus ; tenter un double paiement → refus ; tenter un paiement sans référence → refus
