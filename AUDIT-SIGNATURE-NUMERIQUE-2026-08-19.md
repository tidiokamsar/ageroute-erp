# Audit préalable — Signature électronique opposable

**Objet** : état des lieux avant conception d'un module de signature PAdES B-LTA
**Date de l'audit** : 19/08/2026 · **Décisions de gouvernance actées** : 20/08/2026
**Branche d'analyse** : `fix/logo-et-formats-documents` · **Commit** : `f0f670f`
**Portée** : audit et conception uniquement — aucune implémentation, aucun déploiement.

---

## 0. Décisions de gouvernance actées le 20/08/2026

Les six décisions suivantes sont **approuvées** et intégrées dans le présent document. Elles ne
valent **pas** autorisation de développement : aucun code, aucune migration, aucune modification
de compte, de rôle, de workflow, de schéma ou de donnée n'est autorisé à ce stade.

| # | Décision | Statut | Traduction dans ce document |
|---|---|---|---|
| 1 | **Nominativité des signataires** approuvée. Comptes personnels pour agir et signer ; rôles/groupes pour la fonction organisationnelle. | **Approuvée** — mise en œuvre non autorisée | §7.3, §7.4 |
| 2 | **Création de l'étape DGA**, obligatoire, entre DAF et DG, dans les 11 circuits. DGA = Moussa CAMARA. | **Approuvée** — mise en œuvre non autorisée | §7.6 |
| 3 | **Correction du rapport sur l'ordre du circuit** : `TECHNIQUE → DMC` est conforme à la commande, ce n'est pas une contradiction. | **Appliquée** | §7.2 |
| 4 | **Circuits bailleurs** : les 11 circuits et leurs particularités sont conservés ; le DGA s'ajoute sans rien supprimer. | **Approuvée** — validation métier requise par circuit | §7.6 |
| 5 | **Documents de catégorie A** : génération canonique PDF/A serveur obligatoire ; aucune opposabilité par impression navigateur. | **Approuvée** — mise en œuvre non autorisée | §7.5 |
| 6 | **Conservation : dix ans**, avec renouvellement des horodatages d'archive et gel juridique possible. | **Approuvée** | §7.7, §7.8 |

**Décision 7 — prestataire, TSA et HSM : SUSPENDUE.** Le choix du prestataire de services de
confiance, des certificats recevables, de la TSA (nationale ou étrangère), de la signature
distante sur HSM mutualisé et des exigences du cachet institutionnel reste **suspendu à une
réponse officielle de l'ARPT**. **Aucun fournisseur ne doit être sélectionné ni codé** avant ces
réponses. Les questions à poser figurent au §10.

### ⚠️ Réserve factuelle sur la décision 1

Les trois personnes désignées — **Moïse SIDIBÉ**, **Famo MANSARÉ**, **Moussa CAMARA** — **n'ont
aucun compte dans l'ERP à ce jour** (vérification sur les 20 comptes existants, §7.3). Leurs
adresses complètes ne peuvent donc pas être relevées, et elles ne sont pas inventées dans ce
document. De même, le compte `mission.controle@…` visé par la décision **n'existe pas** : le
compte fonctionnel réel de la mission de contrôle est `mission@ageroute.gov.gn`.

---

## 1. Rapport d'état initial

| Contrôle | Résultat |
|---|---|
| Dépôt Git | `github.com/tidiokamsar/ageroute-erp` |
| Branche analysée | `fix/logo-et-formats-documents` |
| Commit | `f0f670f` — `feat(signature): identité officielle et spécimen de signature` |
| Tag le plus proche | `v2026.08.8-11-gf0f670f` |
| Working tree | **propre** — aucun changement non lié |
| Tests avant modification | **124 / 124 verts** (`node scripts/run-tests.mjs`) |
| Instructions du dépôt | `AGENTS.md` (pas de `CLAUDE.md`) |

Aucun `reset`, `checkout --`, `clean` ni rebase n'a été exécuté.

⚠️ Les commits récents de cette branche ne sont pas poussés sur `origin`. La consigne
interdisant tout `push` pendant cette mission, ils restent locaux.

---

## 2. Écart majeur avec les hypothèses de la commande

La commande décrit une pile **Laravel 12 / Vue.js 3 / Maarch / Flutter**, avec « 28 modules ».
**Cette pile n'existe pas dans ce dépôt.** Vérifié par inspection :

| Hypothèse | Réalité constatée |
|---|---|
| Laravel 12 (PHP) | **Node 20 + Express 4 + TypeScript** — pas de `composer.json`, pas d'`artisan` |
| Vue.js 3 | **React 18 + Vite** |
| Maarch (GED) | **absent** — aucune référence dans le dépôt |
| Flutter | **absent** — aucune application mobile |
| 28 modules | **29 modules** backend (`backend/src/modules/`) |
| Redis / files d'attente | **absent** — ni `bullmq`, ni `ioredis`, ni worker |

### 2.1 Preuves de la pile réelle

Une affirmation de cette portée doit être vérifiable. Relevés bruts, reproductibles :

**Dépendances backend** — `node -e "Object.keys(require('./backend/package.json').dependencies)"`
```
@prisma/client  axios  bcryptjs  cors  express  express-rate-limit  helmet
jsonwebtoken  morgan  multer  nodemailer  pdfkit  prisma  swagger-jsdoc
swagger-ui-express  uuid  zod
```
Aucun paquet PHP, aucune dépendance Laravel. `express` et `@prisma/client` sont les socles.

**Absence de PHP / Laravel**
```
composer.json : absent          artisan : absent
```

**Absence de Maarch et de Flutter** — recherche sur `*.ts`, `*.tsx`, `*.json`, `*.yml`
hors `node_modules` : aucune occurrence de `maarch`, `Maarch`, `flutter`, `Flutter`.

**Frontend** — `frontend/package.json` : React 18, Vite, TailwindCSS, `@tanstack/react-query`.
Aucune trace de Vue.

**Nombre de modules** — `ls backend/src/modules/` : **29** répertoires
```
attachements auth avenants bpmn circuit-financier conformite dashboard decomptes
delegations documents entreprises export funding garanties marches notifications
paiements parametrage portail projets receptions revision routier search
signature signature-audit uploads users workflow
```

**Tests** — `node scripts/run-tests.mjs` : `tests 124 · pass 124 · fail 0`.

**Capacités cryptographiques** — absentes sans exception :
```
node-signpdf  @signpdf/signpdf  pdf-lib  node-forge  asn1js  pkijs  jsrsasign : absents
bullmq  bull  ioredis  redis                                                 : absents
```

Conséquence directe : toute la partie 7 de la commande (interfaces Laravel, intégration Maarch,
première version Flutter) est **sans objet en l'état**. L'architecture proposée est transposée à
la pile réelle. Si la cible est bien une réécriture Laravel, c'est une décision structurante à
prendre **avant** ce chantier, pas pendant — et elle multiplierait l'estimation.

---

## 3. Ce qui existe déjà en matière de signature

Trois mécanismes coexistent, aucun n'est cryptographiquement opposable.

### 3.1 Module `signature` — jeton + empreinte

`backend/src/modules/signature/signature.routes.ts` :

```ts
const tokenSig = uuidv4();
const empreinte = crypto.createHash("sha256")
  .update(`${decompte.id}|${decompte.reference}|${decompte.netAPayer}|${new Date().toISOString()}`)
  .digest("hex");
```

**Analyse.** L'empreinte porte sur quatre champs de la base, **pas sur le PDF produit**. Elle ne
détecte donc aucune altération du document diffusé. Le « code de vérification » est un UUID stocké
en clair : il prouve qu'une ligne existe en base, rien de plus. Il n'y a ni certificat, ni clé
privée, ni horodatage tiers, ni chaîne de certification. **Ce n'est pas une signature électronique
au sens de la Loi L/2016/035/AN** — c'est un accusé interne.

### 3.2 Module `signature-audit` — tables `sig_*`

Six tables existent déjà et constituent la meilleure base de départ :

| Table | Rôle |
|---|---|
| `sig_objects` | objet à signer, versionné (`current_version`), typé (MARCHE, DECOMPTE, PAIEMENT, RECEPTION, AVENANT, CONVENTION, DOCUMENT), statut |
| `sig_signatures` | une ligne par signataire : rôle, méthode, statut, `signed_at`, IP, `user_agent`, `signature_hash`, **`certificate_id`**, motif, compteur de tentatives |
| `sig_events` | journal d'événements |
| `sig_packages` | regroupement de documents |
| `sig_print_history` | traçabilité des impressions |
| `sig_attempts` | tentatives d'authentification |

**Analyse.** Le modèle a été pensé pour accueillir une vraie PKI : `certificate_id` et
`signature_method` sont déjà là, inutilisés. **Il faut étendre ces tables, pas en créer de
nouvelles** — la commande le demande explicitement (§8).

### 3.3 Spécimen de signature (déployé le 19/08/2026)

`users.signatureUrl` — image déposée, apposée sur les écrans de validation.

**Analyse.** Conforme au principe non négociable n°2 : c'est une **représentation graphique**,
jamais une preuve. Le libellé de l'écran le dit déjà : « Elle complète le cachet électronique,
elle ne le remplace pas ». À conserver telle quelle, en veillant à ce qu'aucun écran ni document
ne la présente comme preuve.

---

## 4. Génération documentaire — état

| Élément | Constat |
|---|---|
| Bibliothèque PDF | **PDFKit 0.19** (`backend/src/lib/pdf-gabarit.ts`) |
| Conformité PDF/A | **non supportée** par PDFKit |
| Signature PAdES | **impossible** avec la pile actuelle |
| Dépendances crypto avancées | `node-forge`, `pkijs`, `asn1js`, `@signpdf/signpdf`, `pdf-lib` : **toutes absentes** |
| Gel du contenu à la finalisation | **inexistant** — un décompte reste modifiable après « signature » |
| Impressions HTML | 3 générateurs côté navigateur (attachement, bordereau, marchés) — hors de toute chaîne de preuve |

**Conséquence.** PDFKit produit des PDF simples, non PDF/A, et ne sait pas incorporer de champ de
signature. La cible B-LTA impose soit un remplacement de la chaîne de génération, soit un
post-traitement par un service dédié. C'est le principal poste d'effort technique.

---

## 5. Socles réutilisables

| Besoin de la cible | Existe | Qualité |
|---|---|---|
| Journal d'audit | `audit_logs` + `lib/audit.ts` | Append-only **par convention seulement** — aucun trigger ni contrainte ne l'empêche d'être modifié (vérifié : 0 trigger sur `audit_logs` et `sig_events`) |
| Délégations | `Delegation` + `lib/delegations.ts` (`rolesEffectifs`) | Titulaire, suppléant, dates — **manquent** le périmètre par type de document, le seuil de montant et l'acte justificatif |
| Périmètre / habilitations | `lib/perimetre.ts` (livré le 19/08) | Solide, appliqué aux 19 modules concernés |
| Contrôle d'accès par module | `checkModuleAccess` + `modules.catalog.ts` | Opérationnel |
| Stockage documentaire | `documents` + volume `erp-ageroute_erp_uploads` | Fichiers hors base, noms non devinables, URL signées HMAC 15 min |
| Pièces justificatives | `decomptes.documents.routes.ts` (livré le 19/08) | Versionnement, archivage, circuit dépôt → validation/retour |
| Versionnement documentaire | `Document.version` | Présent mais **sans gel de contenu** |
| MFA | **absent** | Bloquant pour l'exigence « authentification renforcée avant signature » |
| File d'attente | **absente** | Bloquant pour les webhooks résilients et le renouvellement des preuves |
| Horodatage RFC 3161 | **absent** | — |
| OCSP / CRL | **absent** | — |
| HSM | **absent** | — |
| QR code | **absent** | — |
| Archivage probant | **absent** | — |

---

## 6. Parcours documentaires réels

Recherche des points où un document est créé, converti, validé, publié, transmis, archivé :

| Point du parcours | Emplacement | Signable ? |
|---|---|---|
| Dépôt d'une pièce | `POST /decomptes/:id/documents` | Non — pièce entrante de l'entreprise |
| Validation d'une pièce | `POST …/documents/:id/valider` | **Visa** — catégorie C |
| Génération décompte PDF | `modules/documents/documents-officiels.routes.ts` | **Oui — catégorie A** |
| Bordereau de situation | `modules/marches/marches.situation.routes.ts` | Catégorie B |
| Rapport bailleur | `modules/export/rapport-bailleur.routes.ts` | Catégorie B |
| Exports CSV | `modules/export/export.routes.ts` | Catégorie B (export certifié) |
| PDF de signature | `modules/signature/signature.routes.ts` | **Oui — catégorie A** |
| Impressions HTML | 3 pages frontend | Catégorie C — à faire converger vers le PDF serveur |
| Validation de décompte | `POST /decomptes/:id/validations-avancees` | **Oui — catégorie A** |
| Actions de workflow | `POST /workflow/:id/action` | **Visa — catégorie A** |
| Confirmation BCRG | `modules/paiements` | **Oui — catégorie A** |

---

## 7. Matrice complète — documents, niveaux de preuve, signataires

### 7.1 Inventaire exhaustif des documents produits

Relevé par recherche des générateurs (`PDFDocument`, `creerDocumentOfficiel`, `sendCsv`,
`Content-Disposition`) sur les 29 modules. **Aucun autre point de production n'existe.**

| # | Document | Producteur | Format |
|---|---|---|---|
| 1 | Décompte officiel | `documents/documents-officiels.routes.ts:25` | PDF |
| 2 | Fiche d'attachement | `documents/documents-officiels.routes.ts:131` | PDF |
| 3 | PV de réception | `documents/documents-officiels.routes.ts:257` | PDF |
| 4 | Décompte signé (ancien mécanisme) | `signature/signature.routes.ts:59` | PDF |
| 5 | Bordereau de situation du marché | `marches/marches.situation.routes.ts:206` | PDF |
| 6 | Bordereau de situation (données) | `marches/marches.situation.routes.ts:189` | JSON |
| 7 | Rapport bailleur | `export/rapport-bailleur.routes.ts:291` | PDF |
| 8 | Rapport bailleur | `export/rapport-bailleur.routes.ts:222` | XLSX |
| 9 | Rapport bailleur | `export/rapport-bailleur.routes.ts:210` | JSON |
| 10 | Export marchés | `export/export.routes.ts` | CSV |
| 11 | Export décomptes | `export/export.routes.ts` | CSV |
| 12 | Export entreprises | `export/export.routes.ts` | CSV |
| 13 | Export paiements | `export/export.routes.ts` | CSV |
| 14 | Export garanties | `export/export.routes.ts` | CSV |
| 15 | Pièces déposées par l'entreprise | `decomptes/decomptes.documents.routes.ts` | PDF, images, Office |
| 16 | Documents d'entreprise | `entreprises/entreprises.routes.ts:119` | fichiers déposés |
| 17 | Fiche d'attachement (impression) | `frontend/pages/AttachementsPage.tsx` | HTML → navigateur |
| 18 | Bordereau de validation (impression) | `frontend/lib/bordereau.ts` | HTML → navigateur |
| 19 | Fiche marché (impression) | `frontend/pages/MarchesPage.tsx` | HTML → navigateur |

⚠️ Les documents 17 à 19 sont produits **dans le navigateur**, hors de toute chaîne de preuve
serveur. Ils doivent converger vers une génération serveur avant d'être signables — ou être
explicitement cantonnés à la catégorie C.

### 7.2 Circuits de signature réellement définis en base

Relevé sur `workflow_definitions` × `workflow_etapes` — **11 circuits actifs**, un par source de
financement.

| Financement | Circuit constaté en base |
|---|---|
| BANQUE_MONDIALE | MISSION → TECHNIQUE → UGP → DMC → DAF → DG → BAILLEUR |
| UE | MISSION → TECHNIQUE → UGP → DMC → DAF → DG → BAILLEUR |
| BAD | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| BID | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| BOAD | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| BADEA | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| AFD | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| KFW | MISSION → TECHNIQUE → DMC → DAF → DG → BAILLEUR |
| BUDGET_NATIONAL | MISSION → TECHNIQUE → DMC → DAF → DG → **BUDGET → TRESOR** |
| FER | MISSION → TECHNIQUE → DMC → DAF → DG → **FER_AGT → TRESOR** |
| AUTRE | MISSION → TECHNIQUE → DMC → DAF → DG |

**Conformité à la commande — rectification.** Une version antérieure de cet audit présentait
l'ordre `TECHNIQUE → DMC` comme une contradiction avec la commande. **C'était une erreur de
lecture de notre part.** La commande prévoit :

> `Entreprise → contrôles → Direction technique → DMC → DAF → DGA éventuel → DG`

L'ordre Direction technique **puis** DMC est donc bien celui qui était demandé, et le circuit
constaté est **cohérent** sur ce point. Il n'y a pas de contradiction d'ordonnancement.

Les trois écarts **réels** sont les suivants :

| Écart | Nature | Traitement |
|---|---|---|
| **E1 — Absence du DGA** | Aucun rôle `DGA` dans l'énumération `Role` (`schema.prisma:14-29`), aucune étape DGA dans les 11 circuits | Décision actée — voir §7.6 |
| **E2 — Particularités des 11 circuits** | UGP (BM, UE), Trésor (Budget National, FER), FER_AGT, contrôles bailleurs | **Conservées telles quelles** — voir §7.6 |
| **E3 — Étape Entreprise absente de certains circuits internes** | La commande commence par l'Entreprise ; les circuits en base démarrent à MISSION | À qualifier circuit par circuit : dépôt hors workflow, ou étape manquante |

Sur E3 : l'entreprise **dépose** effectivement les pièces via le circuit de dépôt
(`decomptes.documents.routes.ts`, déployé le 19/08/2026), mais ce dépôt n'est pas matérialisé
comme une **étape de workflow** dans `workflow_etapes`. La conséquence probante est réelle : la
contribution de l'entreprise n'est pas horodatée dans la même chaîne que les validations
internes. À trancher lors de la validation métier des circuits.

### 7.3 Signataires — comptes réellement configurés

Relevé exhaustif de la table `users` : **20 comptes, 13 rôles distincts, tous actifs.**

| Rôle | Identifiant configuré | Identité enregistrée | Nature du compte |
|---|---|---|---|
| ADMIN | `admin@ageroute.gov.gn` | Administrateur ERP | fonctionnel |
| ADMIN | `support@ageroute.gov.gn` | support | fonctionnel |
| ADMIN | `tidiane.diallo@ageroute.gov.gn` | Tidiane Diallo | **personnel** |
| DG | `abdoulaye.dabo@ageroute.gov.gn` | Abdoulaye DABO | **personnel** |
| DG | `dg@ageroute.gov.gn` | Directeur Général | fonctionnel |
| DAF | `daf@ageroute.gov.gn` | Directeur Administratif Financier | fonctionnel |
| DMC | `dmc@ageroute.gov.gn` | Direction Marchés et Contrats | fonctionnel |
| DMC | `mohamed.keita@ageroute.gov.gn` | Mohamed lamine Keita | **personnel** |
| UGP | `ugp@ageroute.gov.gn` | Unité de Gestion de Projet | fonctionnel |
| MISSION | `mission@ageroute.gov.gn` | Mission de Contrôle | fonctionnel |
| TECHNIQUE | `technique@ageroute.gov.gn` | Direction Technique | fonctionnel |
| ENTREPRISE | `colas@ageroute.gov.gn` | COLAS Afrique — Agence Guinée | société |
| ENTREPRISE | `entreprise@ageroute.gov.gn` | Entreprise Titulaire | société |
| ENTREPRISE | `sogea@ageroute.gov.gn` | Responsable SOGEA-SATOM | société |
| ENTREPRISE | `sored@ageroute.gov.gn` | SORED Bâtiment & Routes | société |
| AUDITEUR | `auditeur@ageroute.gov.gn` | Auditeur Interne | fonctionnel |
| BAILLEUR | `bailleur@ageroute.gov.gn` | Représentant Bailleur | fonctionnel |
| BUDGET | `budget@ageroute.gov.gn` | Direction du Budget (MEF) | fonctionnel |
| TRESOR | `tresor@ageroute.gov.gn` | Direction Générale du Trésor | fonctionnel |
| FER_AGT | `fer@ageroute.gov.gn` | Fonds d'Entretien Routier | fonctionnel |

**Aucun compte n'a de `fonction` renseignée.** La colonne existe depuis la migration
`2026-08-19-user-signature.sql` mais elle est vide pour les 20 comptes. Or la qualité exercée
doit figurer dans la preuve de signature : c'est une donnée à saisir en L0.

**Constat : 3 comptes personnels sur 20.** Neuf rôles signataires reposent exclusivement sur des
comptes de fonction. Aucun certificat nominatif ne peut leur être délivré en l'état.

#### ⚠️ Trois identités approuvées ne sont pas encore configurées

Vérification faite sur les 20 comptes — recherche sur `email`, `nom` et `prenom` :

| Personne approuvée | Préfixe d'identifiant approuvé | Présence dans l'ERP |
|---|---|---|
| Moïse SIDIBÉ | `moise.sidibe@` | **ABSENT** |
| Famo MANSARÉ | `famo.mansare@` | **ABSENT** |
| Moussa CAMARA | `moussa.camara@` | **ABSENT** |

Les adresses complètes **ne peuvent pas être relevées : ces comptes n'existent pas.** Elles ne
sont donc pas écrites ici. Le domaine reste à confirmer par la Direction ; on note seulement, à
titre factuel, que les 20 comptes existants utilisent tous `@ageroute.gov.gn` et que les trois
comptes personnels déjà créés suivent la forme `prenom.nom@`.

**Le compte `mission.controle@…` mentionné dans la décision n'existe pas non plus.** Le compte
fonctionnel réellement configuré pour la mission de contrôle est **`mission@ageroute.gov.gn`**.
C'est lui qui est visé par la décision de transformation en rôle/groupe non signataire.

### 7.4 Matrice de migration — comptes fonctionnels vers rôles et personnes

Principe acté : **un compte personnel pour agir et signer, un rôle/groupe pour représenter la
fonction organisationnelle.** Le groupe reçoit et répartit les tâches ; il ne signe jamais.

| Compte fonctionnel actuel | Rôle / groupe cible | Personnes membres | Signataire autorisé | Certificat nominatif requis |
|---|---|---|---|---|
| `mission@ageroute.gov.gn` | Groupe `MISSION` — **externe, non signataire** | **chef de Mission désigné par la mission de contrôle**, compte créé par l'administrateur AGEROUTE | compte personnel du chef de Mission | **Oui** — un par chef de Mission, question d'émetteur à trancher (§10) |
| `technique@ageroute.gov.gn` | Groupe `TECHNIQUE` — interne, non signataire | coordinateurs de projet AGEROUTE | compte personnel du coordinateur | **Oui** |
| `dmc@ageroute.gov.gn` | Groupe `DMC` — non signataire | Mohamed lamine Keita (déjà nominatif) + à compléter | `mohamed.keita@ageroute.gov.gn` | **Oui** |
| `daf@ageroute.gov.gn` | Groupe `DAF` — non signataire | à désigner | compte personnel du DAF | **Oui** |
| `dg@ageroute.gov.gn` | Groupe `DG` — non signataire | Abdoulaye DABO (déjà nominatif) | `abdoulaye.dabo@ageroute.gov.gn` | **Oui** |
| *(à créer)* | Rôle `DGA` — non signataire | **Moussa CAMARA** | compte personnel `moussa.camara@…` | **Oui** |
| `ugp@ageroute.gov.gn` | Groupe `UGP` — interne, non signataire | coordinateurs de projet AGEROUTE | compte personnel du coordinateur | **Oui** |
| `budget@ageroute.gov.gn` | Groupe `BUDGET` (externe MEF) — non signataire | agents désignés par le MEF | compte personnel de l'agent | **Oui** — délivré côté MEF |
| `tresor@ageroute.gov.gn` | Groupe `TRESOR` (externe) — non signataire | agents désignés par le Trésor | compte personnel de l'agent | **Oui** — délivré côté Trésor |
| `fer@ageroute.gov.gn` | Groupe `FER_AGT` (externe) — non signataire | agents désignés par le FER | compte personnel de l'agent | **Oui** — délivré côté FER |
| `bailleur@ageroute.gov.gn` | Groupe `BAILLEUR` (externe) — non signataire | représentants par bailleur | compte personnel du représentant | **Oui** — délivré côté bailleur |
| `colas@`, `sogea@`, `sored@`, `entreprise@` | Groupes `ENTREPRISE` par société — non signataires | mandataires sociaux et personnes habilitées | compte personnel de la personne habilitée | **Oui** + preuve du pouvoir d'engager |
| `auditeur@ageroute.gov.gn` | Groupe `AUDITEUR` | à désigner | — consultation seule | Non |
| `admin@`, `support@` | Comptes techniques | — | **aucune signature métier** | Non |

**Positionnement des trois identités approuvées**, sous réserve de la confirmation du domaine :

| Personne | Rôle attendu | Qualité à enregistrer dans la preuve |
|---|---|---|
| Moïse SIDIBÉ | à préciser par la Direction | à renseigner en L0 (colonne `fonction`) |
| Famo MANSARÉ | à préciser par la Direction | à renseigner en L0 |
| **Moussa CAMARA** | **DGA** | Directeur Général Adjoint |

La décision approuve la nominativité de ces trois personnes mais n'affecte explicitement de rôle
qu'à Moussa CAMARA (DGA). Le rôle de Moïse SIDIBÉ et de Famo MANSARÉ reste à préciser avant
création des comptes.

**Exigences invariantes de la preuve.** Quel que soit le compte, la signature doit conserver
conjointement :

1. l'**identité personnelle** du signataire (nom, prénom, identifiant du certificat) ;
2. le **rôle** au titre duquel il intervient (`MISSION`, `DGA`, …) ;
3. la **qualité exercée** (fonction précise à la date de signature) ;
4. le cas échéant, la **délégation** qui fonde son intervention.

Ces quatre éléments sont portés par les attributs signés du PDF, pas seulement par la base.

### 7.5 Documents de catégorie A — génération canonique obligatoire

Décision actée :

- **génération canonique PDF/A côté serveur obligatoire** pour tout document opposable ;
- **signature PAdES B-LTA sur cette version gelée**, et sur elle seule ;
- **aucun document juridiquement opposable ne dépend d'une impression HTML du navigateur** ;
- les impressions navigateur sont **limitées aux brouillons et à la catégorie C** ;
- les originaux Word/Excel éventuels sont **conservés**, mais **le document final opposable est
  la version PDF/A signée**.

Les trois impressions navigateur actuelles, précisément identifiées :

| # | Impression navigateur | Fichier source | Objet | Migration cible |
|---|---|---|---|---|
| 17 | Fiche d'attachement | `frontend/src/pages/AttachementsPage.tsx` | impression d'un gabarit HTML | rendu serveur PDF/A — le générateur existe déjà (`documents-officiels.routes.ts:131`), il suffit d'y router l'impression |
| 18 | Bordereau de validation | `frontend/src/lib/bordereau.ts` | bordereau de circuit assemblé côté client | **nouveau générateur serveur** — aucun équivalent PDF n'existe |
| 19 | Fiche marché | `frontend/src/pages/MarchesPage.tsx` | fiche de synthèse marché | rendu serveur PDF/A, à rapprocher de `marches.situation.routes.ts:206` |

Tant que la migration n'est pas faite, ces trois sorties doivent porter une **mention visible
« BROUILLON — SANS VALEUR JURIDIQUE »**, au même titre que l'adaptateur simulé.

### 7.6 Insertion de l'étape DGA dans les onze circuits

Décision actée : **le DGA est Moussa CAMARA**, et une **étape DGA obligatoire** est insérée
**entre la DAF et le DG** dans les onze circuits, sans supprimer aucune étape spécifique.

| Financement | Circuit cible avec DGA |
|---|---|
| BANQUE_MONDIALE | MISSION → TECHNIQUE → UGP → DMC → DAF → **DGA** → DG → BAILLEUR |
| UE | MISSION → TECHNIQUE → UGP → DMC → DAF → **DGA** → DG → BAILLEUR |
| BAD | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| BID | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| BOAD | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| BADEA | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| AFD | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| KFW | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BAILLEUR |
| BUDGET_NATIONAL | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → BUDGET → TRESOR |
| FER | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG → FER_AGT → TRESOR |
| AUTRE | MISSION → TECHNIQUE → DMC → DAF → **DGA** → DG |

Les étapes spécifiques — **UGP**, **Trésor**, **FER_AGT**, **contrôles bailleurs** — sont
**toutes conservées**. Aucune n'est supprimée ni fusionnée. Chaque circuit restera soumis à une
**validation métier avant implémentation**.

Règles que devra respecter l'implémentation future :

1. l'étape est **affectée au rôle `DGA`** ;
2. elle **exige l'intervention du compte personnel de Moussa CAMARA** ;
3. elle **enregistre son identité, sa qualité et son certificat nominatif** dans la preuve ;
4. elle **interdit toute signature réalisée directement par un compte fonctionnel** ;
5. une éventuelle **suppléance passe exclusivement par une délégation formelle, datée, limitée
   et traçable** — jamais par un partage de compte ou de certificat ;
6. **le DGA n'est jamais contourné automatiquement en cas d'absence** : le dossier attend, ou une
   délégation est établie.

Impacts structurels à prévoir (aucun n'est réalisé à ce stade) :

- `Role` (`backend/prisma/schema.prisma:14-29`) — ajout de la valeur `DGA` ;
- `workflow_etapes` — insertion d'une étape dans les 11 définitions, avec renumérotation des
  étapes situées après la DAF ;
- `lib/roles-circuit.ts` et `lib/circuit-definitions.ts` — prise en compte du nouveau rôle ;
- `lib/perimetre.ts` — périmètre de visibilité du DGA ;
- frontend — libellés, filtres « Mes tâches », tableaux de bord.

⚠️ **Point de vigilance sur les dossiers en cours.** L'insertion d'une étape dans un circuit ne
doit pas invalider les instances de workflow déjà engagées. La migration devra soit figer les
instances existantes sur l'ancienne définition (versionnement du circuit), soit être appliquée à
un moment où aucune instance n'est en cours. **C'est un point de conception à trancher avant
toute écriture**, et il relève du versionnement des circuits, pas de la signature.

### 7.7 Matrice document → preuve → signataires → conservation

**Durée de conservation approuvée : dix ans**, appliquée uniformément. Les mentions « 30 ans »
des versions antérieures de ce document sont **caduques**.

| # | Document | Cat. | Preuve exigée | Signataires, dans l'ordre | Conservation |
|---|---|---|---|---|---|
| 1 | **Décompte officiel** | A | PAdES B-LTA | selon le circuit du financement (§7.6) | 10 ans |
| 2 | **Fiche d'attachement** | A | PAdES B-LTA | MISSION → TECHNIQUE, contradictoire avec ENTREPRISE | 10 ans |
| 3 | **PV de réception** | A | PAdES B-LTA | MISSION → TECHNIQUE → ENTREPRISE → DG | 10 ans |
| 4 | Décompte signé (ancien) | — | à retirer | — | remplacé par 1 |
| 5 | Bordereau de situation | B | Cachet institutionnel | — | 10 ans |
| 6 | Bordereau (données) | C | Empreinte | — | 10 ans |
| 7 | Rapport bailleur PDF | B | Cachet institutionnel | — | 10 ans |
| 8 | Rapport bailleur XLSX | D | Original conservé + rendu PDF/A cacheté opposable | — | 10 ans |
| 9 | Rapport bailleur JSON | E | Manifeste signé — à étudier | — | 10 ans |
| 10-14 | Exports CSV | B | Cachet + empreinte dans l'en-tête | — | 10 ans |
| 15 | Pièces de l'entreprise | C | Empreinte + visa MISSION/TECHNIQUE | déposant identifié | 10 ans |
| 16 | Documents d'entreprise | C | Empreinte + date d'expiration | — | 10 ans |
| 17-19 | Impressions HTML | C | brouillon — migration serveur prévue (§7.5) | — | non archivées |
| — | **Contrat / marché** | A | PAdES B-LTA | DMC → DAF → **DGA** → DG | 10 ans |
| — | **Avenant** | A | PAdES B-LTA | DMC → DAF → **DGA** → DG | 10 ans |
| — | **Ordre de service** | A | PAdES B-LTA | TECHNIQUE → DG | 10 ans |
| — | **Certification de paiement** | A | PAdES B-LTA | DAF → **DGA** → DG | 10 ans |
| — | **Décision / notification** | A | PAdES B-LTA | autorité signataire | 10 ans |
| — | Confirmation bancaire BCRG | A | PAdES B-LTA | BCRG | 10 ans |
| — | Garantie (acte bancaire) | C | Empreinte — acte externe | — | 10 ans |

Les six documents de catégorie A marqués « — » dans la colonne `#` **ne sont pas encore produits
par l'ERP**. Leur génération est un chantier documentaire distinct du chantier signature, et
préalable à celui-ci.

### 7.8 Périmètre exact de la conservation décennale

La durée de dix ans ne porte pas sur le seul PDF. Elle couvre **tout ce qui permet de rejouer la
vérification dix ans plus tard** :

| Élément conservé | Support | Motif |
|---|---|---|
| PDF/A signé | stockage documentaire | le document opposable lui-même |
| Toutes les signatures intégrées | dans le PDF | preuve principale |
| Certificats et chaînes de certification | dans le PDF (DSS) + copie | vérifier l'identité du signataire |
| Preuves OCSP / CRL | dans le PDF (DSS) + copie | prouver la validité **à la date de signature** |
| Jetons d'horodatage RFC 3161 | dans le PDF | ancrer la date |
| Listes de confiance utilisées | `sig_listes_confiance` | prouver que le prestataire était reconnu **ce jour-là** |
| Dossier d'exploitation | `sig_dossiers_preuves` | copie d'exploitation — **jamais probante à elle seule** |
| Journal d'audit | base + archives | traçabilité des actions |
| Délégations et actes justificatifs | base + pièces | fonder une signature par suppléance |
| Versions remplacées | stockage documentaire | reconstituer l'historique |
| Preuves de renouvellement B-LTA | dans le PDF | chaîner les horodatages d'archive |

**Renouvellement des horodatages d'archive.** Un jeton d'horodatage vieillit : l'algorithme
faiblit, le certificat de la TSA expire. Un PAdES B-LTA doit donc recevoir un **nouvel horodatage
d'archive avant l'expiration du précédent**, pendant toute la durée de conservation. C'est un
**processus périodique**, pas une opération unique au moment de la signature. Sans lui, la preuve
se dégrade avant la fin des dix ans.

**Gel juridique (suspension de purge).** Aucune suppression automatique ne doit intervenir
lorsqu'un gel est actif. Un gel doit pouvoir être posé en cas de :

- contentieux ou procédure judiciaire ;
- audit interne ou externe ;
- enquête administrative ;
- exigence d'un bailleur ;
- obligation légale particulière.

Le gel **suspend la purge** et doit être lui-même tracé : qui l'a posé, quand, pour quel motif,
sur quel périmètre, et quand il est levé. Tant qu'un gel est actif, l'échéance des dix ans est
sans effet.

## 8. Analyse des écarts

| Exigence cible | État | Écart |
|---|---|---|
| PAdES Baseline B-LTA | absent | **Total** — pile PDF incompatible |
| Certificat nominatif reconnu ARPT | absent | **Total** — aucun prestataire retenu |
| Horodatage RFC 3161 | absent | **Total** |
| Empreinte SHA-256 | partiel | Existe, mais **sur des champs de base, pas sur le PDF** |
| Chaîne de certification | absent | **Total** |
| OCSP / CRL embarqués | absent | **Total** |
| Validation à long terme | absent | **Total** |
| Clé privée en HSM | sans objet | Aucune clé n'existe |
| Authentification renforcée | absent | **Total** — mot de passe seul |
| Consentement explicite | absent | **Total** |
| Journal d'audit immuable | partiel | Journal présent, **immuabilité non garantie** |
| Portail de vérification QR | partiel | Vérification par jeton existe, **sans QR ni page publique** |
| Archivage probant | absent | **Total** |
| Gel du contenu à la signature | absent | **Total** — écart le plus grave |
| Paramètres cryptographiques configurables | sans objet | À concevoir dès le départ |

---

## 9. Modèle de menace

| # | Menace | Vraisemblance | Impact | Parade prévue |
|---|---|---|---|---|
| M1 | Altération d'un PDF après signature | Élevée aujourd'hui | Majeur | PAdES : toute modification invalide la signature |
| M2 | Substitution d'un décompte par un autre montant | Moyenne | Majeur | Empreinte du **fichier**, pas des champs |
| M3 | Signature par une personne non habilitée | Moyenne | Majeur | Contrôle des habilitations **à l'instant de la signature**, MFA |
| M4 | Usage d'une délégation expirée | Élevée | Majeur | Vérification période + périmètre + seuil |
| M5 | Copie de l'image de signature | **Élevée** | Majeur | L'image n'est jamais une preuve — principe n°1 |
| M6 | Rejeu d'un webhook du prestataire | Moyenne | Majeur | Signature HMAC, horodatage, `nonce`, idempotence |
| M7 | Vol de clé privée | Faible si HSM | Critique | HSM ou signature distante — jamais de clé côté applicatif |
| M8 | Répudiation par le signataire | Moyenne | Majeur | Certificat nominatif + horodatage + journal + consentement tracé |
| M9 | Perte de valeur probante dans le temps | Certaine | Majeur | B-LTA + renouvellement des horodatages d'archive |
| M10 | Fuite par le portail public | Moyenne | Majeur | Identifiant aléatoire, données publiables uniquement |
| M11 | Double signature concurrente | Faible | Moyen | Verrou applicatif + idempotence |
| M12 | Panne TSA / OCSP / prestataire | Élevée | Moyen | File d'attente, reprise, dégradation explicite — jamais de signature « best effort » |
| M13 | Modification du journal d'audit | **Possible aujourd'hui** | Majeur | Triggers de blocage, chaînage par empreinte |
| M14 | Compte de signature partagé | Élevée en pratique | Critique | Un certificat = une personne physique — principe n°5 |

---

## 10. Points nécessitant une validation juridique écrite

**Je ne fournis pas d'avis juridique.** Les points suivants doivent être tranchés par écrit :

**Pour l'ARPT**
1. Quels prestataires de services de confiance sont reconnus en Guinée à ce jour ?
2. Un certificat étranger (eIDAS ou autre) est-il reconnu ? Sous quelles conditions ?
3. Existe-t-il une autorité d'horodatage nationale ? À défaut, quelle TSA est admise ?
4. Quels algorithmes et longueurs de clé sont prescrits ou proscrits ?
5. Quelles exigences de certification pèsent sur l'ERP lui-même au titre des décrets
   D/2026/0159 et D/2026/0160 ? Un audit préalable est-il obligatoire avant mise en service ?
6. Le cachet institutionnel d'une personne morale publique est-il reconnu distinctement de la
   signature d'une personne physique ?
7. Quelle norme de HSM est exigée (FIPS 140-3, Critères Communs, autre) ?

**Pour la Direction juridique d'AGEROUTE**
8. Quels documents engagent juridiquement l'agence et exigent une signature personnelle ?
9. Quelles délégations de signature sont formellement en vigueur, avec quels seuils ?
10. ~~Quelles durées de conservation s'appliquent aux pièces comptables et aux marchés ?~~
    **Tranchée le 20/08/2026 : dix ans** (§7.7, §7.8). Reste à confirmer qu'aucune règle
    d'archives publiques guinéenne n'impose une durée supérieure pour certains actes.
11. Les bailleurs (BAD, BM, UE, BID, FER) imposent-ils leurs propres exigences de signature ?
12. Le PDF signé devient-il l'original juridique, ou le papier reste-t-il l'original ?
13. **Quel certificat pour le chef de Mission, qui n'est pas agent de l'Agence ?** La mission de
    contrôle est un **prestataire externe** : elle désigne son chef de Mission, dont le compte est
    ensuite créé par l'administrateur AGEROUTE. Or c'est lui qui signe le constat contradictoire
    fondant le décompte — la première signature de la chaîne. Trois options : certificat personnel
    délivré par un prestataire reconnu ; certificat délivré sous la responsabilité de la société de
    supervision ; certificat émis par l'Agence pour la durée du contrat. Dans les trois cas, le
    pouvoir du signataire doit être rattaché au **contrat de supervision**, comme le pouvoir
    d'engager d'un mandataire d'entreprise l'est aux statuts.
14. **Que devient la valeur des signatures d'une mission de contrôle dont le contrat s'est
    achevé ?** Le compte sera désactivé et le certificat expirera. Les documents signés
    antérieurement restent valables par l'horodatage — mais il faut le confirmer par écrit, car
    c'est exactement le cas de figure que la conservation décennale doit couvrir.

**Point d'attention.** Tant que les questions 1 à 3 restent sans réponse écrite, **aucune
implémentation de production n'est possible** : sans prestataire reconnu ni TSA admise, une
signature B-LTA techniquement correcte pourrait rester juridiquement inopposable en Guinée.

---

## 11. Risques critiques

| # | Risque | Portée | Atténuation |
|---|---|---|---|
| R1 | Aucun prestataire de confiance reconnu identifié | **Bloquant** | Saisir l'ARPT avant tout développement |
| R2 | Pile PDF incompatible avec PAdES | Élevé | Service de signature dédié, en aval de la génération |
| R3 | Pile réelle ≠ pile supposée par la commande | Élevé | Trancher la question Laravel avant d'engager |
| R4 | Absence de MFA | Élevé | Prérequis, à traiter comme un lot autonome |
| R5 | Absence de file d'attente | Moyen | Introduire une file avant les webhooks |
| R6 | Journal d'audit modifiable | Élevé | Triggers + chaînage — lot rapide et à forte valeur |
| R7 | Absence de gel documentaire | **Élevé** | Sans lui, signer n'a aucun sens |
| R8 | Coût récurrent des certificats et de la TSA | Moyen | À budgéter : ~1 certificat par signataire habilité |
| R9 | Renouvellement des preuves à long terme | Moyen | Tâche planifiée, à concevoir dès le départ |
| R10 | 12 comptes de fonction non nominatifs | **Élevé** | Un certificat exige une personne physique : `dg@`, `daf@`, `mission@` devront devenir nominatifs |

Le risque **R10** mérite une attention particulière : sur les 20 comptes existants, la majorité
sont des comptes de fonction (`mission@ageroute.gov.gn` porte le nom « Mission de Contrôle »).
Un certificat nominatif ne peut pas leur être délivré. **La nominativité des comptes est un
prérequis, pas une conséquence.**

---

*Suite : `PLAN-SIGNATURE-NUMERIQUE.md` — architecture cible, modèle de données, ADR, lots.*
