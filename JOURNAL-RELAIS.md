# Journal des relais — programme de paramétrage A1 → A10

> **PROTOCOLE DE RELAIS (obligatoire — cf. PLAN-TRAVAIL-AGENT-PARAMETRAGE.md §2.7)**
> À la FIN de chaque lot, l'agent qui livre consigne dans CE fichier, dans le
> même commit que sa livraison (ou que la fusion) :
> 1. **son rapport de fin de lot** — ce qui est fait, branche/commit, résultats
>    de vérification (tsc, tests Node 20, build), ce qui reste à faire ;
> 2. **le prompt du prochain lot** pour l'agent suivant — autoportant, prêt à
>    coller, démarrant uniquement du dépôt et de ce journal.
>
> L'entrée suivante s'ajoute EN TÊTE (plus récente en premier). Une entrée
> consignée n'est jamais réécrite — on la corrige par une nouvelle entrée.
> Le tableau de suivi (§4 du plan de travail) est mis à jour dans le même
> commit.

---

---

---

---

## RELAIS N°5 — 18/08/2026 — de Claude → DSI (fusion) puis relecteur (L0.2)

### Rapport de fin de lot — L0.2 « API CRUD + 4 yeux »

**Contexte.** L0.2 n'avait jamais ete livre : le programme est passe de L0.1 a
L0.3. Consequence, le registre de regles etait inatteignable — tables creees,
moteur de resolution en place, calcul et simulateur les consommant, mais aucun
moyen de creer ni de valider une regle. C'est ce trou que ce lot comble.

**Branche** : `feat/regles-l02-api` depuis master.

**Livre.**
- `modules/parametrage/regles.catalogue.ts` — metadonnees des 28 cles
  (categorie, libelle, type, options) et validation PURE : `validerValeur`,
  `validerDemande`, `peutValiderRegle`. Aucune base, aucune horloge implicite.
- 3 routes dans le module parametrage (requireAuth au routeur + ADMIN/DAF) :
  - `GET  /api/parametrage/regles?categorie=&portee=` — defauts fusionnes avec
    les surcharges, derniere modification et demandes en attente ;
  - `POST /api/parametrage/regles` — creation/nouvelle version en BROUILLON,
    versionnement automatique par (cle, portee, porteeId) ;
  - `POST /api/parametrage/regles/:id/valider` — quatre yeux, passage VALIDE,
    ecriture de `regle_gestion_historique` dans la MEME transaction que la mise
    a jour, `logAudit` (CREATE / APPROVE), puis `invaliderCacheRegles()`.
- `regles.catalogue.test.ts` — 22 cas : matrice de rejets (cle inconnue, motif
  court, type incoherent par type ENUM/NUMBER/BOOLEAN/MULTI/JSON, portee sans
  porteeId, portee inconnue, date d'effet passee, date illisible), exhaustivite
  du catalogue, validite des defauts eux-memes, et quatre yeux (auto-validation
  refusee y compris pour ADMIN et DAF, roles tiers refuses).

**Verification.** `npx tsc --noEmit` : 0 erreur. `node scripts/run-tests.mjs` :
**119/119** (97 avant ce lot). Comportement par defaut inchange : tant qu'aucune
regle n'est VALIDE, le moteur retombe sur REGLES_DEFAUT.

### ⚠️ Incident corrige pendant ce lot — a lire avant toute nouvelle migration

`2026-08-18-regles-gestion.sql` creait les colonnes en **snake_case**
(`portee_id`, `date_effet`, `saisi_par`...) alors que les modeles Prisma
`RegleGestion` / `RegleGestionHistorique` ne portent aucun `@map` : Prisma
interroge donc `"porteeId"`, `"dateEffet"`, etc.

Toute lecture echouait par `column "porteeId" does not exist`. Comme
`chargerRegles()` est appele par les decomptes, le circuit financier, la
conformite et les circuits de roles, **le coeur de l'ERP etait casse en
production** des l'application de cette migration (deploiement v2026.08.5).

Corrige : colonnes renommees en camelCase sur la base de production (tables
vides, aucun risque de donnee), et fichier SQL reecrit en camelCase avec un
bloc de rattrapage idempotent pour les bases ayant recu la premiere version.
Verifie avec le client Prisma du conteneur en service : les deux tables se
lisent.

**Lecon pour les prochains lots** : le controle « concordance SQL ↔
schema.prisma » du protocole §2 doit se faire en executant une requete portant
les noms de colonnes que Prisma emet, pas en relisant les deux fichiers.

### PROMPT pour la DSI (humain) — fusion

```bash
git fetch origin
git checkout master && git pull --ff-only origin master
git merge --no-ff origin/feat/regles-l02-api -m "merge: L0.2 API CRUD regles + quatre yeux"
git push origin master
```

Aucune migration SQL nouvelle dans ce lot. Le correctif de
`2026-08-18-regles-gestion.sql` est deja applique en production ; il est
idempotent et sans effet si rejoue.

### PROMPT pour le relecteur — lot L0.2

```text
Tu es relecteur du lot L0.2 du programme de parametrage A1-A10 de l'ERP
AGEROUTE. References : PLAN-TRAVAIL-AGENT-PARAMETRAGE.md (protocole §2),
PLAN-DEV-PARAMETRAGE-A1-A10.md §1.1/1.3, JOURNAL-RELAIS.md (RELAIS N°5).
Objet : branche feat/regles-l02-api, base master.

1. git fetch && git checkout feat/regles-l02-api
2. Relecture selon la checklist du protocole §2 :
   a. DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs
      (119/119) — rejoue dans un conteneur node:20-slim AVEC openssl
      (conditions du Dockerfile), sinon Prisma echoue sur libssl ;
   b. Securite : les 3 routes exigent ADMIN ou DAF ; verifie qu'aucun chemin
      ne permet a un saisisseur de valider sa propre regle, que l'historique
      est ecrit dans la meme transaction que le passage VALIDE (pas de
      validation sans trace), et que invaliderCacheRegles() est bien appele
      APRES la transaction ;
   c. Concordance : les colonnes lues par Prisma existent reellement — execute
      une requete SELECT portant les noms camelCase sur la base, ne te contente
      pas de relire schema.prisma ;
   d. Coherence : REGLES_DEFAUT ↔ METADONNEES (exhaustivite dans les deux
      sens, deja couverte par test) ; les valeurs par defaut passent leur
      propre validation.
3. Verdict : APPROUVE (avec remarques) ou REFUS motive.
4. Consigne le RELAIS N°6 : rapport de relecture + prompt du lot suivant.
```

---

## RELAIS N°4 — 18/08/2026 — de ZCode → Claude (relecture L1.2 ; L0.2 spec update)

### Rapport de fin de lot — L1.2 « Snapshot + gel » (ZCode)

- **Branche** : `feat/regles-l12-snapshot` · **commit** `5f97d11` · base
  `feat/regles-l11-moteur@4e07e7a` (L0.1 + L0.3 + L1.1 inclus)
- **Livré** :
  - `Decompte.reglesSnapshot` (SQL 2026-08-18 + Prisma) : règles effectives
    figées au dernier calcul (méthode GLOBAL/LIGNES + date) ;
  - service create/update écrivent le snapshot GLOBAL ; la route lignes
    écrit le snapshot LIGNES au recalcul des totaux ;
  - `GET /api/decomptes/:id/recalcul-audit` (ADMIN/DAF/DG/AUDITEUR) :
    rejoue avec LE snapshot (jamais les règles actuelles), compare champ à
    champ, 422 explicite pour les décomptes antérieurs au mécanisme ;
  - `decomptes.regles.audit.ts` : rejouerCalcul/lireSnapshot purs +
    verifierGelFinancier + compterDecomptesEnCircuit (portées) ;
  - **L0.2 spec updated**: la validation d'une règle FINANCE doit appeler
    le gel (voir prompt L0.2 mis à jour dans PLAN-TRAVAIL).
- **Vérifications** : `npx tsc` 0 erreur · `npm test` **79/79**.
- **Couverture** : concordance exacte (GLOBAL), rejeu suit le SNAPSHOT pas
  les règles actuelles, montant altéré détecté, LIGNES avec plancher,
  422 sans snapshot, gel (refusé/autorisé).
- **NON fait** : UI (L0.4) ; production deployment (opérateur).

### PROMPT pour CLAUDE — relecture L1.2

```text
Tu es relecteur du lot L1.2 du programme de paramétrage A1-A10 de l'ERP
AGEROUTE. Références : JOURNAL-RELAIS.md (relais N°4 = rapport), PLAN-
TRAVAIL-AGENT-PARAMETRAGE.md, PLAN-DEV-PARAMETRAGE-A1-A10.md.

Objet : branche feat/regles-l12-snapshot (commit 5f97d11).

1. git fetch && git checkout feat/regles-l12-snapshot
2. Relecture :
   a. DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs
      (79/73... attendu 79/79) — rejouer en conteneur node:20-slim ;
   b. Audit de rejeu : vérifier que rejouerCalcul utilise bien le snapshot
      fourni et jamais les règles actuelles ; vérifier que la voie LIGNES
      compare la combinaison (pas les arrondis) ; vérifier le 422 sans
      snapshot ;
   c. Gel : verifierGelFinancier pure, compterDecomptesEnCircuit couvre
      toutes les portées (GLOBAL/BAILLEUR/TYPE_MARCHE/MARCHE) ; vérifier
      que la spec L0.2 (dans PLAN-TRAVAIL) appelle bien le gel.
3. Verdict : APPROUVÉ ou REFUS (motivé).
4. Consigne le RELAIS suivant dans JOURNAL-RELAIS.md (en tête) : rapport +
   PROMPT pour la DSI (fusion des 4 branches dans l'ordre empilé :
   feat/regles-p0-socle → feat/regles-l03-simulateur → feat/regles-l11-moteur
   → feat/regles-l12-snapshot, chacune déjà empilée, donc fusion
   séquentielle dans cet ordre exact) + rappel L0.2 pour Codex.
```

## RELAIS N°3 — 18/08/2026 — de ZCode → Claude (relecture L1.1, cumulable L0.1/L0.3)

### Rapport de fin de lot — L1.1 « Moteur de calcul paramétré » (ZCode)

- **Branche** : `feat/regles-l11-moteur` · **commit** `4e07e7a` · base
  `feat/regles-l03-simulateur@28555b8` (L0.1 + L0.3 incluses)
- **Livré** :
  - `decomptes.calc.regles.ts` : moteur entier pur paramétré A1-A7
    (assiettes, formule précompte, ARMP, plancher net, pénalités
    SAISIE/FORMULE plafonnées, avances, arrondis, plafond d'avance) ;
    résultat aux noms EXACTS des colonnes du modèle Decompte ;
  - service : copie inline flottante retirée — elle renvoyait des champs
    inconnus de Prisma (bug préexistant « Unknown arg » sur create/update,
    corrigé par construction) ; 2 sites → moteur + chargerRegles(portée
    marché) ;
  - routes : cascade inline de POST /:id/lignes → moteur ; totaux en
    BigInt (fin des Number() sur montants) ; net borné selon A4 ;
  - `lib/regles.ts` : clé RG_PENALITE_ASSIETTE ajoutée (défaut HT).
- **Vérifications** : `npx tsc` 0 erreur · `npm test` **73/73**.
- **Preuves clés** : parité BIT À BIT avec la référence officielle
  `decomptes.calc.ts` (4 cas fixes dont 25 Md GNF + propriété 300 cas
  aléatoires reproductibles LCG seedé) ; matrice A1×A2×A3 (12) ;
  équivalences FORMULE↔SAISIE ; la référence officielle est INCHANGÉE.
- **SIGNALÉ POUR ARBITRAGE DAF (non touché, §3.3)** : `POST /:id/calculate`
  applique une formule simplifiée divergente (retenue sur HT brut, sans
  ARMP ni précompte) — harmonisation à décider (lot L1.2/L1.3).
- **NON fait** : snapshot des règles par décompte et gel (L1.2) ; UI (L0.4).

### PROMPT pour CLAUDE — relecture croisée de L1.1 (cumulable L0.1/L0.3)

```text
Tu es relecteur du lot L1.1 du programme de paramétrage A1-A10 de l'ERP
AGEROUTE. Références : JOURNAL-RELAIS.md (relais N°3 = rapport), PLAN-
TRAVAIL-AGENT-PARAMETRAGE.md (protocole §2 + spécif L1.1), PLAN-DEV-
PARAMETRAGE-A1-A10.md §1.2.

Objet : branche feat/regles-l11-moteur (commit 4e07e7a), base
feat/regles-l03-simulateur (L0.1+L0.3 déjà livrées).

1. git fetch && git checkout feat/regles-l11-moteur
2. Relecture :
   a. DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs
      (73/73) — rejouer en conteneur node:20-slim + openssl ;
   b. PREUVE CENTRALE : parité moteur ↔ decomptes.calc.ts (référence
      officielle, NON modifiée — vérifier que le fichier est identique au
      master) ; recalculer à la main un cas (1 000 000 GNF, 18/5/20) ;
      exécuter la propriété 300 cas et vérifier le caractère reproductible
      du générateur (LCG seedé 20260818) ;
   c. Sécurité/cohérence du rebranchement : service et routes chargent les
      règles via chargerRegles (portée marcheId/bailleur=financement/
      typeMarche) — vérifier l'absence de boucle d'invalidation du cache,
      et que create/update du service n'étalent plus de champs inconnus ;
   d. Vérifier l'anomalie signalée (POST /:id/calculate formule divergente)
      n'a PAS été modifiée — signalée pour arbitrage DAF uniquement.
3. Verdict : APPROUVÉ ou REFUS (motivé).
4. Consigne le RELAIS suivant dans JOURNAL-RELAIS.md (en tête) : rapport
   de relecture + PROMPT pour la DSI (ordre de fusion des branches
   empilées : feat/regles-p0-socle PUIS feat/regles-l03-simulateur PUIS
   feat/regles-l11-moteur) + rappel des prompts Codex (L0.2 API puis
   L0.4 UI). Commit et pousse.
```

### Point d'attention DSI (humain)

Trois branches empilées attendent : L0.1 (socle) → L0.3 (simulateur) →
L1.1 (moteur). Fusionner DANS CET ORDRE après les relectures Claude.
## RELAIS N°2 — 18/08/2026 — de ZCode → Claude (relecture L0.3, cumulable avec L0.1)

### Rapport de fin de lot — L0.3 « Simulateur » (ZCode)

- **Branche** : `feat/regles-l03-simulateur` · **commit** `28555b8` · base `feat/regles-p0-socle@7e79de3` (L0.1 incluse)
- **Livré** :
  - `backend/src/modules/parametrage/simulateur.ts` — simulation PURE en
    arithmétique entière paramétrée par les règles (assiette RG, formule
    précompte, ARMP assiette/inclusion, plancher du net, avances, arrondi),
    formules en clair, fusion des surcharges via `resoudreRegles` ;
  - `POST /api/parametrage/regles/simuler` (ADMIN, DAF) — avant/après ligne
    à ligne avec écarts, clés inconnues rejetées, aucune écriture ;
  - `backend/src/modules/parametrage/simulateur.test.ts` — 10 tests.
- **Vérifications** : `npx tsc` 0 erreur · `npm test` **60/60**.
- **DoD prouvé par tests** : aux défauts la simulation égale EXACTEMENT
  `calcDecompte` (1 M, 25 Md GNF, pénalités/révision, taux 10/8/15) ;
  A1=HT ne change que la retenue ; A4/A2/A3/A6/A7 couverts.
- **NON fait (hors périmètre)** : UI du simulateur (à brancher dans l'onglet
  L0.4) ; moteur réel paramétré (L1.1) ; `decomptes.calc.ts` inchangé
  (formule officielle protégée §3.3).
- **Point d'attention relecteur** : l'égalité défauts ↔ `calcDecompte` est
  l'invariant critique — vérifier les trois tests DoD ligne à ligne.

### PROMPT pour CLAUDE — relecture croisée de L0.3 (cumulable avec L0.1)

```text
Tu es relecteur du lot L0.3 du programme de paramétrage A1-A10 de l'ERP
AGEROUTE. Références dans le dépôt : JOURNAL-RELAIS.md (relais N°2 = rapport
de livraison), PLAN-TRAVAIL-AGENT-PARAMETRAGE.md (protocole §2 + spécif L0.3),
PLAN-DEV-PARAMETRAGE-A1-A10.md §1.3.

Objet : branche feat/regles-l03-simulateur (commit 28555b8), base
feat/regles-p0-socle (L0.1, relecture en cours ou faite par ailleurs).

1. git fetch && git checkout feat/regles-l03-simulateur
2. Relecture :
   a. DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs
      (60/60) — rejoue dans un conteneur node:20-slim + openssl (conditions
      Dockerfile) ;
   b. Invariant critique : vérifier que les tests « DoD » comparent bien
      simulation (défauts) ↔ calcDecompte de decomptes.calc.ts, et recalculer
      toi-même un cas (1 000 000 GNF, taux 18/5/20) à la main ;
   c. Sécurité : POST /api/parametrage/regles/simuler — requireAuth router +
      requireRole ADMIN/DAF, validation zod (clés inconnues rejetées, bornes),
      aucune écriture en base, aucun secret dans la réponse ;
   d. Cohérence : simulateur.ts vs PLAN-DEV §1.3 ; arithmétique entière
      (multiplier avant diviser, arrondi RG_ARRONDI_MODE).
3. Verdict : APPROUVÉ ou REFUS (motivé).
4. Consigne le RELAIS suivant dans JOURNAL-RELAIS.md (en tête) : ton rapport
   de relecture (L0.1 et L0.3 si les deux faites) + PROMPT pour la DSI
   (fusion des branches dans l'ordre : feat/regles-p0-socle PUIS
   feat/regles-l03-simulateur — cette dernière est empilée dessus) + rappel
   du PROMPT Codex L0.2 (après fusion de L0.1). Commit et pousse.
```
## RELAIS N°1 — 18/08/2026 — de ZCode → Claude (relecture), puis DSI (fusion), puis Codex (L0.2)

### Rapport de fin de lot — L0.1 « Socle données + moteur » (ZCode)

- **Branche** : `feat/regles-p0-socle` · **commit** `7e79de3` · base `master@ca0e5bc`
- **Livré** :
  - `backend/prisma/sql/2026-08-18-regles-gestion.sql` — tables `regle_gestion`
    (portée GLOBAL/BAILLEUR/TYPE_MARCHE/MARCHE, date d'effet, statut
    BROUILLON→VALIDE, motif obligatoire, version, CHECK) et
    `regle_gestion_historique` (append-only) ;
  - modèles Prisma `RegleGestion` / `RegleGestionHistorique` (schéma à jour,
    client régénéré) ;
  - `backend/src/lib/regles.ts` — registre `REGLES_DEFAUT` (24 clés, valeurs =
    comportement actuel), `resoudreRegles()` pure (portée → date → version ;
    BROUILLON/ARCHIVE et dates futures ignorés ; clés inconnues ignorées),
    `chargerRegles()` avec cache 60 s + `invaliderCacheRegles()`, accès typés
    `nombreRegles`/`booleenRegles` avec repli sur défaut ;
  - `backend/src/lib/regles.test.ts` — 9 tests dont l'invariant du programme.
- **Vérifications** : `npx tsc` 0 erreur · `npm test` **50/50** (41 + 9) sous
  Node 24 (le lanceur `run-tests.mjs` garantit l'équivalence Node 20).
- **NON fait (volontairement, hors périmètre L0.1)** : aucune route API, aucune
  UI, aucune consommation par le moteur de calcul (L1.1), aucune écriture en
  base — la table vide ne change aucun comportement.
- **Point d'attention relecteur** : concordance SQL ↔ `schema.prisma`
  (contrainte unique à cinq colonnes, `portee_id` non nul `DEFAULT ''`).

### PROMPT pour CLAUDE — relecture croisée de L0.1 (à exécuter maintenant)

```text
Tu es relecteur du lot L0.1 du programme de paramétrage A1-A10 de l'ERP
AGEROUTE. Références dans le dépôt : PLAN-TRAVAIL-AGENT-PARAMETRAGE.md
(protocole §2, lot L0.1), PLAN-DEV-PARAMETRAGE-A1-A10.md (architecture §1),
JOURNAL-RELAIS.md (relais N°1 = rapport de livraison).

Objet : branche feat/regles-p0-socle (commit 7e79de3), base master.

1. git fetch && git checkout feat/regles-p0-socle
2. Relecture selon la checklist du protocole §2 :
   a. DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs
      (50/50) — rejoue-les dans un conteneur node:20-slim avec openssl
      (conditions du Dockerfile) comme tu sais le faire ;
   b. Sécurité : rien n'est exposé (aucune route), aucune régression
      possible table vide ; vérifie l'absence d'évaluation dynamique,
      de fuite d'information dans les logs, et que le cache n'introduit
      pas de partage d'état entre requêtes ;
   c. Concordance : backend/prisma/sql/2026-08-18-regles-gestion.sql ↔
      modèles du schema.prisma (colonnes, contraintes, index) ;
   d. Cohérence architecture : lib/regles.ts vs PLAN-DEV §1.2 (résolution,
      cache, invalidation) ; invariant : REGLES_DEFAUT = constantes
      historiques de decomptes.service (comparer ligne à ligne).
3. Verdict : APPROUVÉ (avec remarques éventuelles) ou REFUS (motivé).
4. Consigne le RELAIS N°2 dans JOURNAL-RELAIS.md (en tête, jamais réécrire) :
   rapport de relecture + PROMPT pour la DSI (commandes de fusion de la
   branche dans master après ton approbation, application SQL différée au
   prochain déploiement avec pg_dump préalable — jamais db push) + PROMPT
   pour Codex (lot L0.2, spécification autoportante dans le plan §3).
   Commit sur master et pousse.
```

### PROMPT pour CODEX — lot L0.2 « API CRUD + 4 yeux » (à exécuter APRÈS fusion de L0.1 dans master)

```text
Tu réalises le lot L0.2 du programme de paramétrage A1-A10 de l'ERP AGEROUTE.
Point d'entrée : JOURNAL-RELAIS.md (dernier relais), PLAN-TRAVAIL-AGENT-
PARAMETRAGE.md (protocole §2 + spécification L0.2 §3), PLAN-DEV-
PARAMETRAGE-A1-A10.md §1.1/1.3 (modèle et contrat API).

Branche : feat/regles-l02-api depuis master à jour. Interdits absolus :
prisma db push ; formule financière modifiée sans passer par une règle ;
suppression d'audit ; messages non français.

À implémenter dans le module parametrage (router-level requireAuth + ADMIN) :
- GET  /api/parametrage/regles?categorie=&portee= — liste des règles
  (défauts fusionnés avec les valeurs en base) + dernière modification ;
- POST /api/parametrage/regles — création ou nouvelle version → statut
  BROUILLON ; motif ≥ 10 caractères obligatoire ; validation zod : type
  cohérent avec options (ENUM dans les choix, NUMBER dans min/max,
  BOOLEAN true/false, MULTI liste de rôles valides) ; portee/porteeId
  cohérents (portée ≠ GLOBAL ⇒ porteeId requis) ; dateEffet ≥ aujourd'hui ;
  cle doit exister dans REGLES_DEFAUT (sinon 400) ;
- POST /api/parametrage/regles/:id/valider — rôle DAF, ou ADMIN différent
  du saisiPar (quatre yeux) ; passage VALIDE + validePar/valideAt ;
  écriture simultanée de la ligne regle_gestion_historique (append-only,
  ancienne valeur, motif) ; logAudit systématique ;
  appel invaliderCacheRegles() après validation ;
- Rejets testés : auto-validation, motif court, type incohérent, clé
  inconnue, date d'effet passée, portée sans porteeId.

DoD : cd backend && npx tsc (0 erreur) ; node scripts/run-tests.mjs (tout
vert, tests nouveaux inclus) ; comportement par défaut inchangé (aucune
consommation par le moteur de calcul — c'est L1.1).

À la fin : consigne le RELAIS suivant dans JOURNAL-RELAIS.md — ton rapport
de fin de lot + le PROMPT pour ZCode (lot L0.3 simulateur, spécification
§3 du plan) ; même commit que ta livraison ; branche poussée ; mets à jour
le tableau de suivi §4 du plan.
```

### Action DSI (humain) — après approbation Claude

Fusionner la branche dans master (`git merge --no-ff feat/regles-p0-socle`),
mettre à jour le tableau §4, pousser. Le SQL `2026-08-18-regles-gestion.sql`
sera appliqué en production **au prochain déploiement** uniquement, selon le
runbook (pg_dump préalable, psql, jamais db push).
