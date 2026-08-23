# Plan de conception — Signature électronique opposable (PAdES B-LTA)

**Compagnon de** `AUDIT-SIGNATURE-NUMERIQUE-2026-08-19.md`
**Statut** : conception arrêtée — **aucune implémentation engagée, aucun développement autorisé.**
**Décisions de gouvernance intégrées** : 20/08/2026 (voir audit §0).

---

## 0. Ce que les décisions du 20/08/2026 changent dans ce plan

| Décision | Effet sur la conception |
|---|---|
| Nominativité des signataires | Le signataire est **toujours** une personne physique titulaire d'un compte personnel. Les rôles deviennent des **groupes d'affectation non signataires**. Voir §2 *Comptes, rôles et signataires*. |
| Étape DGA obligatoire entre DAF et DG dans les 11 circuits | Nouveau rôle `DGA`, nouvelle étape, **versionnement des circuits** rendu obligatoire. Voir §2 *Circuits* et §4. |
| Conservation dix ans | `retention_until` calculé à dix ans, **renouvellement périodique des horodatages d'archive**, et **gel juridique** bloquant toute purge. Voir §2 *Conservation* et ADR-04. |
| PDF/A serveur obligatoire pour la catégorie A | `FinalisationDocument` devient un **passage obligé** ; les trois impressions navigateur migrent ou sont marquées « brouillon ». Voir §2 *Génération canonique*. |
| Circuits bailleurs conservés | Aucune simplification des 11 circuits. Chacun est **validé métier avant implémentation**. |
| Prestataire / TSA / HSM suspendus à l'ARPT | `AdaptateurPrestataire` **reste vide**. Aucun SDK, aucun nom de fournisseur, aucune dépendance n'entre dans le dépôt avant réponse écrite. |

---

## 1. Architecture cible

Un module transversal `signature-numerique`, isolé du métier. Les 29 modules ne connaissent
jamais la PKI : ils demandent une signature et reçoivent un résultat.

```
  Module métier (décomptes, marchés, réceptions…)
        │  « fais signer ce document par ce circuit »
        ▼
  ┌─────────────────────────────────────────────────────┐
  │  OrchestrateurSignature                             │
  │   · crée la demande, applique le circuit            │
  │   · vérifie habilitation ET délégation à l'instant  │
  │   · gère les états, l'idempotence, les verrous      │
  └──────────┬──────────────────────────────┬───────────┘
             │                              │
             ▼                              ▼
  ┌────────────────────┐        ┌──────────────────────────┐
  │ FinalisationDoc    │        │ SignatureProviderInterface│
  │  · gèle le contenu │        │  (contrat unique)         │
  │  · rend en PDF/A   │        ├──────────────────────────┤
  │  · calcule SHA-256 │        │ AdaptateurPrestataire     │ ← production
  │  · appose le QR    │        │ AdaptateurSimule          │ ← tests/dev
  └────────────────────┘        └──────────────────────────┘
             │                              │
             ▼                              ▼
  ┌────────────────────┐        ┌──────────────────────────┐
  │ ServicePAdES       │◄───────┤ ServiceHorodatage (3161)  │
  │  B / B-T / B-LT    │        │ ServiceValidationCert     │
  │  / B-LTA           │        │ ServiceOCSP-CRL           │
  └────────┬───────────┘        └──────────────────────────┘
           │
           ▼
  ┌────────────────────┐   ┌───────────────┐   ┌────────────────────┐
  │ ArchivageProbant   │   │ JournalAudit  │   │ API de vérification │
  │  · dossier preuves │   │  append-only  │   │  publique (QR)      │
  │  · renouvellement  │   │  chaîné       │   │                     │
  └────────────────────┘   └───────────────┘   └────────────────────┘
```

**Principe directeur** : `SignatureProviderInterface` est la seule frontière avec l'extérieur.
Changer de prestataire ne doit toucher qu'un adaptateur.

### Séquence — signature d'un décompte

```
Agent          Écran            Orchestrateur      Finalisation   Prestataire   TSA
  │  finaliser   │                    │                 │             │          │
  │─────────────►│───────────────────►│  gèle + PDF/A   │             │          │
  │              │                    │────────────────►│             │          │
  │              │  aperçu obligatoire│◄────────────────│ empreinte   │          │
  │◄─────────────│                    │                 │             │          │
  │  MFA + consentement explicite     │                 │             │          │
  │─────────────►│───────────────────►│ vérifie droits  │             │          │
  │              │                    │ ET délégation   │             │          │
  │              │                    │────────────────────────────► │          │
  │              │                    │                 │  signe (clé en HSM)    │
  │              │                    │◄──── webhook authentifié ─────│          │
  │              │                    │  horodate ───────────────────────────►   │
  │              │                    │◄──────────────────── jeton RFC 3161 ──   │
  │              │                    │  OCSP + CRL → B-LTA → archive + journal  │
  │◄─────────────│◄───────────────────│                                          │
```

---

## 2. Modèle de données

**Principe** : étendre les tables `sig_*` existantes plutôt que d'en créer de nouvelles.
Elles portent déjà `certificate_id`, `signature_method`, `signature_hash` — inutilisés.

### Source de vérité du schéma — levée d'une contradiction

La première rédaction disait à la fois que les tables `sig_*` restent « hors schéma Prisma » et
qu'il faudrait modifier `schema.prisma` pour les étendre. Les deux ne peuvent pas être vrais.

**Décision : les tables `sig_*` entrent dans `schema.prisma`.**

Il faut distinguer deux choses que le dépôt confond :

| | Rôle | Outil |
|---|---|---|
| `schema.prisma` | **déclaration typée** pour générer le client | `prisma generate` |
| `prisma/sql/*.sql` | **seul mécanisme d'évolution** du schéma réel | `psql` |

Les tables `bpmn_*` et `ref_*` sont hors `schema.prisma` pour une raison historique, et cela leur
coûte cher : tout y passe par `$queryRaw`, sans typage ni vérification à la compilation. Pour un
module dont la valeur juridique dépend de l'exactitude des données, c'est un risque inacceptable.

Le précédent existe déjà dans ce dépôt : `regle_gestion` **est** déclarée dans `schema.prisma` et
n'a jamais été migrée autrement que par fichier SQL. C'est le modèle à suivre.

**Règle qui en découle, sans exception** : `schema.prisma` déclare, `prisma/sql/*.sql` fait
évoluer. `prisma db push` reste interdit — il détruirait `bpmn_*` et `ref_*`, qui restent hors
schéma.

### Tables à étendre

| Table | Ajouts |
|---|---|
| `sig_objects` | `document_version_id`, `content_hash`, `frozen_at`, `public_verification_id` (aléatoire, non séquentiel), `superseded_by`, `retention_until` |
| `sig_signatures` | `certificate_snapshot` (JSONB), `chain_snapshot`, `ocsp_response`, `crl_snapshot`, `timestamp_token`, `pades_level`, `delegation_id`, `consent_at`, `consent_ip`, `mfa_method`, `provider_request_id` |
| `sig_events` | `event_hash`, `previous_hash` — chaînage rendant toute réécriture détectable |

### Tables nouvelles (strict nécessaire)

| Table | Rôle |
|---|---|
| `sig_documents_finalises` | rendu PDF/A gelé : chemin, empreinte, taille, date de gel |
| `sig_dossiers_preuves` | **copie** du dossier de preuves — voir l'avertissement ci-dessous |
| `sig_renouvellements` | horodatages d'archive successifs (B-LTA sur la durée) |
| `sig_webhooks_recus` | idempotence et anti-rejeu : `provider_event_id` unique, `nonce`, `recu_at`, `methode_auth`, `preuve_auth` |
| `sig_certificats` | certificats connus : empreinte, période de validité, émetteur, chaîne |
| `sig_listes_confiance` | instantanés des listes de confiance — voir ci-dessous |
| `sig_gels_juridiques` | suspensions de purge (contentieux, audit, enquête…) — voir *Conservation* |
| `groupes_fonctionnels` | rôles organisationnels **non signataires** — voir *Comptes, rôles et signataires* |
| `groupes_membres` | rattachement des personnes aux groupes, avec dates |

### Reconnaissance par l'ARPT — un état daté, pas un drapeau

Un champ mutable `statut_reconnaissance_ARPT` serait insuffisant, et même trompeur : il donnerait
au moment du contrôle une réponse qui n'était peut-être pas celle en vigueur au moment de la
signature. La reconnaissance est un **fait daté**, qui doit être conservé comme tel.

`sig_listes_confiance` conserve, à chaque consultation :

| Donnée | Raison |
|---|---|
| `source_officielle` | URL ou référence de l'acte publiant la liste |
| `version_liste` | version ou numéro de publication |
| `periode_validite_debut` / `_fin` | période couverte par cette version |
| `consulte_at` | date et heure de consultation |
| `empreinte_liste` | SHA-256 du contenu récupéré, pour prouver qu'il n'a pas été altéré |
| `contenu` | instantané intégral |

Et **chaque signature référence l'instantané utilisé** (`sig_signatures.trust_list_snapshot_id`).
On peut ainsi répondre des années plus tard à la seule question qui vaille : *au moment où cette
signature a été apposée, ce prestataire figurait-il sur la liste reconnue, et selon quelle
version publiée ?*

### ⚠️ Les preuves vivent DANS le PDF

Le profil B-LTA impose que le certificat du signataire, la chaîne de certification, les réponses
OCSP, les CRL et les jetons d'horodatage soient **incorporés au PDF lui-même** — dans le
dictionnaire DSS pour les preuves de validation, et par horodatage de document pour l'archive.

La table `sig_dossiers_preuves` n'est donc **pas** le lieu de la preuve : elle en conserve une
copie exploitable pour l'administration, la supervision et le renouvellement, sans avoir à
ré-ouvrir chaque PDF. Un document extrait de l'ERP et transmis à un bailleur ou produit en
justice doit être vérifiable **seul, hors ligne**, sans accès à notre base.

Corollaire : si la copie en base et les preuves embarquées divergent, **les preuves embarquées
font foi**. La base sert l'exploitation, le PDF porte la valeur probante.

### Comptes, rôles et signataires — un compte personnel signe, un groupe reçoit

Décision actée le 20/08/2026. Elle impose une distinction que le modèle actuel ne fait pas :
aujourd'hui `users.role` sert **à la fois** à router les tâches et à autoriser les validations.
Il faut séparer les deux.

| Notion | Porte quoi | Peut signer ? |
|---|---|---|
| **Compte personnel** | une personne physique, un certificat nominatif | **Oui — seul cas** |
| **Rôle / groupe fonctionnel** | une fonction organisationnelle, une file de tâches | **Jamais** |

Conséquences sur le modèle :

| Table | Évolution |
|---|---|
| `users` | `est_compte_personnel` (booléen), `fonction` **obligatoire** pour tout compte signataire |
| *(nouvelle)* `groupes_fonctionnels` | code (`MISSION`, `DMC`, `DGA`…), libellé, **`peut_signer = false` par construction** |
| *(nouvelle)* `groupes_membres` | rattachement personne ↔ groupe, avec dates d'entrée et de sortie |
| `sig_signatures` | `signataire_user_id`, `role_exerce`, `qualite_exercee`, `groupe_id` — les quatre conservés ensemble |

**Invariants que le code devra rendre impossibles à violer :**

1. une signature dont `signataire_user_id` pointe un compte non personnel est **refusée** ;
2. un groupe ne possède **aucun** certificat ;
3. le compte fonctionnel peut **recevoir** une tâche, jamais la **signer** ;
4. l'identité personnelle, le rôle et la qualité exercée sont **tous trois** inscrits dans les
   attributs signés du PDF — pas seulement en base.

**Ce que le compte fonctionnel devient.** `mission@ageroute.gov.gn` — et non
`mission.controle@…`, qui n'existe pas — reste un point d'entrée : il regroupe les membres de la
mission de contrôle et reçoit leurs tâches. Il perd toute capacité de signature. La personne qui
traite un dossier le signe avec **son** compte.

⚠️ **Ce chantier est un prérequis strict.** Tant qu'il n'est pas fait, aucune signature nominative
n'est possible, et il ne dépend pas de la technique mais de désignations par la Direction. C'est
le contenu du lot L0 organisationnel.

### Circuits — le versionnement devient obligatoire

L'insertion de l'étape DGA entre la DAF et le DG dans les onze circuits n'est pas une simple
ligne à ajouter : elle décale toutes les étapes situées après la DAF. Des dossiers sont en cours.

**Une définition de circuit ne doit donc plus être modifiable en place.** Le modèle devient :

| Table | Évolution |
|---|---|
| `workflow_definitions` | `version`, `actif_depuis`, `actif_jusqua` — une modification crée une **nouvelle version** |
| `workflow_instances` | `definition_version_id` — l'instance reste liée à la version sous laquelle elle a démarré |

Sans cela, l'ajout du DGA réécrirait rétroactivement le circuit de dossiers déjà validés — ce qui
détruirait la cohérence de la preuve : un décompte signé sous un circuit à six étapes apparaîtrait
comme incomplet sous un circuit à sept.

**Règles propres à l'étape DGA** (reprises de l'audit §7.6, à implémenter le moment venu) :

- affectée au rôle `DGA` ;
- exige le compte personnel de **Moussa CAMARA** ;
- enregistre identité, qualité et certificat nominatif ;
- **interdit** toute signature par un compte fonctionnel ;
- suppléance **uniquement** par délégation formelle, datée, limitée, traçable ;
- **aucun contournement automatique** en cas d'absence : le dossier attend.

### Génération canonique — la finalisation devient un passage obligé

Décision actée : tout document de catégorie A est **rendu en PDF/A côté serveur**, gelé, puis
signé. Aucune opposabilité ne peut naître d'une impression navigateur.

`FinalisationDocument` n'est donc plus un service parmi d'autres : c'est **le seul chemin** par
lequel un document opposable peut exister. Conséquences :

| Sortie actuelle | Devenir |
|---|---|
| `AttachementsPage.tsx` (impression) | route vers le générateur serveur existant |
| `lib/bordereau.ts` (impression) | **nouveau générateur serveur à écrire** |
| `MarchesPage.tsx` (impression) | route vers un générateur serveur |
| Rapports XLSX | l'original reste conservé ; **le PDF/A cacheté est l'opposable** |

Tant que la migration n'est pas faite, ces sorties portent une mention **« BROUILLON — SANS
VALEUR JURIDIQUE »** visible à l'impression.

### Conservation — dix ans, renouvellement et gel

`retention_until` = date de signature + **10 ans**, appliqué uniformément.

Deux mécanismes que la simple date ne suffit pas à couvrir :

**Renouvellement des horodatages d'archive.** Un B-LTA se dégrade : le certificat de la TSA
expire, l'algorithme s'affaiblit. Un travail planifié doit ré-horodater les documents **avant**
l'expiration du jeton courant, et tracer chaque renouvellement dans `sig_renouvellements`. Sans
ce processus, la preuve meurt avant les dix ans.

**Gel juridique.** Nouvelle table `sig_gels_juridiques` :

| Colonne | Rôle |
|---|---|
| `perimetre` | document, marché, ou périmètre plus large |
| `motif` | contentieux, audit, enquête, exigence bailleur, obligation légale |
| `pose_par_user_id` / `pose_at` | qui, quand |
| `leve_par_user_id` / `leve_at` | levée tracée, jamais silencieuse |

Tant qu'un gel est actif sur un périmètre, **aucune purge ne s'y applique**, quelle que soit
l'échéance. La purge automatique doit interroger cette table avant toute suppression — et en
l'absence de réponse claire, **ne rien supprimer**.

### Extension des délégations existantes

`Delegation` porte titulaire, suppléant et dates. Il manque, et c'est exigé :
`type_document_autorise`, `montant_seuil_gnf`, `acte_justificatif_url`, `perimetre_marche_ids`.

### États

`DRAFT → FINALIZED → TO_SIGN → PARTIALLY_SIGNED → SIGNED → ARCHIVED`
Sorties : `REJECTED`, `CANCELLED`, `EXPIRED`, `SUPERSEDED`.

⚠️ **Révocation d'un certificat.** Une révocation postérieure à une signature valablement
horodatée n'invalide pas automatiquement le document. La validité dépend notamment de la date de
révocation, de son motif, de l'éventuelle date de compromission et des preuves disponibles au
moment de la signature.

La nuance est déterminante : une révocation pour cessation de fonctions laisse intactes les
signatures antérieures, tandis qu'une révocation pour compromission de clé peut remettre en cause
les signatures postérieures à la date de compromission — laquelle est souvent antérieure à la date
de révocation déclarée. Le vérificateur doit donc conserver et afficher le motif et la date de
compromission lorsqu'elle est connue, et **ne jamais trancher seul** : au-delà du constat
technique, l'appréciation revient au juge ou à l'autorité compétente. Le portail énonce les faits,
il ne prononce pas la nullité.

---

## 3. Décisions d'architecture (ADR)

### ADR-01 — PAdES Baseline B-LTA

**Contexte.** La Loi L/2016/035/AN reconnaît la signature créée par un dispositif fiable, sous
contrôle exclusif du signataire, reposant sur un certificat. Les décomptes sont conservés 10 ans
ou plus ; les certificats expirent en 1 à 3 ans.

**Décision.** Cibler PAdES B-LTA pour la catégorie A.

**Justification.** B seul devient invérifiable à l'expiration du certificat. B-T ajoute
l'horodatage, B-LT les preuves de révocation, B-LTA l'horodatage d'archive qui permet de
renouveler la valeur probante sans re-signer. Pour une pièce comptable conservée dix ans, c'est
le seul niveau qui tienne.

**Conséquences.** Dépendance à une TSA disponible ; renouvellement périodique à planifier ;
dossier de preuves à conserver aussi longtemps que le document.

**Alternative écartée.** CAdES détaché — non lisible par un agent ouvrant le PDF.

---

### ADR-02 — Abstraction du prestataire de confiance

**Contexte.** Aucun prestataire reconnu par l'ARPT n'est identifié à ce jour (question ouverte
n°1). Développer contre une API précise, c'est parier sur une réponse qu'on n'a pas.

**Décision.** `SignatureProviderInterface` + deux adaptateurs : un réel, un simulé.

**Justification.** Permet de construire et tester toute la chaîne — gel, PDF/A, états, circuit,
portail, journal — **avant** de connaître le prestataire. Le jour où l'ARPT tranche, seul
l'adaptateur est écrit.

**Conséquences.** L'adaptateur simulé produit des signatures **techniquement formées mais sans
aucune valeur juridique**. Un seul contrôle sur `NODE_ENV` serait bien trop faible : cette
variable est modifiable, oubliée lors d'une copie d'environnement, et absente d'un conteneur mal
configuré. Cinq garde-fous indépendants, chacun suffisant à lui seul :

1. **Configuration typée et validée au démarrage** — le fournisseur est une énumération fermée
   contrôlée par le schéma d'environnement, pas une chaîne libre.
2. **Refus au démarrage** — le processus **ne démarre pas** si le fournisseur simulé est demandé
   alors que l'environnement se déclare de production. On échoue bruyamment, jamais en silence.
3. **Drapeau de fonctionnalité interdit en production** — le drapeau activant le simulé est
   refusé par le service de configuration hors développement et test.
4. **Contrôle d'intégration continue** — un test de la chaîne échoue si l'image destinée à la
   production embarque une configuration autorisant le simulé.
5. **Filigrane indélébile** — tout document produit porte la mention
   **« SIMULATION — SANS VALEUR JURIDIQUE »** en filigrane sur chaque page, dans les métadonnées
   du PDF, et dans la réponse du portail de vérification.

Le cinquième garde-fou est le plus important : même si les quatre premiers tombaient, un document
simulé resterait **immédiatement reconnaissable** par son lecteur.

---

### ADR-03 — Gestion des clés et HSM

**Contexte.** Principe non négociable n°3 : jamais de clé privée en base, en dépôt, en `.env`
ou sur le serveur applicatif.

**Décision.** Aucune clé privée ne transite par l'ERP. Deux modes : signature distante chez le
prestataire (clé sous contrôle exclusif du signataire), ou HSM pour le cachet institutionnel.

**Justification.** Le contrôle exclusif exigé par la loi est incompatible avec une clé détenue
par l'application. Un HSM conforme FIPS 140-3 ou équivalent, sous réserve des prescriptions ARPT.

**Conséquences.** L'ERP n'orchestre que des demandes. Une panne du prestataire bloque la
signature — c'est voulu : mieux vaut ne pas signer que signer mal.

---

### ADR-04 — Archivage probant

**Contexte.** Conserver un PDF signé ne suffit pas : sans les preuves de révocation contemporaines
et le renouvellement des horodatages, la vérification échoue au bout de quelques années.

**Décision.** Dossier de preuves distinct du document, renouvellement planifié des horodatages
d'archive, empreinte de chaque version conservée, et conservation selon les durées confirmées par
la Direction juridique.

**Justification.** C'est la différence entre archiver un fichier et archiver une preuve.

**Conséquences.** Une tâche planifiée devient critique : si le renouvellement ne tourne pas
pendant des mois, la valeur probante se dégrade silencieusement. Métrique et alerte obligatoires.

---

## 4. Stratégie de migration

Additive et réversible, conformément au principe n°12 et à `AGENTS.md §3.1`.

1. Colonnes ajoutées en `ADD COLUMN IF NOT EXISTS`, jamais de `DROP`.
2. **Répétition à blanc sur une COPIE RESTAURÉE, jamais sur la production.** Le dump quotidien
   est restauré dans une base jetable, représentative en volume et en contenu ; la migration y est
   jouée intégralement, puis les requêtes applicatives sont exercées contre elle.
   *Correction d'une pratique en cours* : les migrations du 18 et du 19/08 ont été répétées
   directement sur la base de production, dans des transactions annulées. Le résultat était
   correct, mais le procédé ne l'est pas — un `BEGIN … ROLLBACK` pose des verrous sur les tables
   visées, et une erreur de frappe sur le `ROLLBACK` laisserait la modification appliquée. Une
   base de préproduction doit être mise en place **avant** le lot L0.
3. `pg_dump -Fc` avant toute opération de schéma, copie hors serveur (déjà en place, à conserver).
4. **Jamais `prisma db push`** — il détruirait `bpmn_*` et `ref_*`, qui restent hors schéma.
   Les tables `sig_*` entrent dans `schema.prisma` (cf. §2) mais n'évoluent que par fichier SQL.
5. Les documents historiques ne sont **pas** signés rétroactivement (principe n°11). Ils
   conservent leur statut actuel et sont marqués « antérieurs au dispositif ».
6. Le mécanisme jeton + empreinte actuel reste en service jusqu'à bascule complète d'un module,
   puis est marqué obsolète — sans suppression des données produites.
7. **L'ajout du rôle `DGA` et de son étape ne modifie aucune instance de workflow en cours.**
   L'ordre est impératif : d'abord versionner `workflow_definitions`, ensuite seulement créer la
   nouvelle version de chaque circuit. Faire l'inverse réécrirait rétroactivement le parcours de
   dossiers déjà validés.
8. **Un ajout de valeur à l'énumération `Role` n'est pas réversible en PostgreSQL.** `ALTER TYPE …
   ADD VALUE` ne se retire pas et ne s'exécute pas dans une transaction avec d'autres opérations
   selon la version. La répétition à blanc sur copie restaurée est donc ici obligatoire, pas
   recommandée.

---

## 4 bis. Authentification des callbacks du prestataire

Imposer HMAC dès maintenant reviendrait à choisir le prestataire par la bande. Le contrat doit
donc être **agnostique** et accepter, selon ce que le fournisseur retenu impose :

| Mécanisme | Ce qui est vérifié | Conservé dans `sig_webhooks_recus` |
|---|---|---|
| **JWS** | signature JSON détachée, en-tête et algorithme | jeton et `kid` |
| **Signature asymétrique** | signature du corps par la clé publique du prestataire | signature et empreinte de clé |
| **mTLS** | certificat client présenté à l'établissement TLS | empreinte du certificat client |
| **HMAC** | condensat partagé | condensat et identifiant de secret |
| **Combinaison** | par exemple mTLS + JWS | l'ensemble des éléments ci-dessus |

`VerificateurCallbackInterface` porte une seule méthode — *cette requête vient-elle bien du
prestataire ?* — et chaque adaptateur fournit son implémentation. Le mécanisme retenu est
**enregistré avec chaque événement** (`methode_auth`, `preuve_auth`) : des années plus tard, on
doit pouvoir dire non seulement que le callback a été accepté, mais **sur quelle base**.

Trois propriétés restent obligatoires quel que soit le mécanisme :

- **idempotence** — `provider_event_id` en contrainte d'unicité ; un rejeu est reconnu et ignoré,
  jamais retraité ;
- **anti-rejeu** — `nonce` et fenêtre temporelle bornée ;
- **corrélation** — un callback sans demande de signature correspondante est rejeté et journalisé.

## 5. Stratégie de tests

Les 18 tests exigés, avec leur nature :

| # | Test | Nature |
|---|---|---|
| 1 | Un octet modifié invalide la signature | Intégration — altérer le PDF et vérifier |
| 2 | Personne non habilitée refusée | Unitaire — matrice habilitation |
| 3 | Délégation expirée refusée | Unitaire — fonction pure sur dates et périmètre |
| 4 | Certificat révoqué avant signature refusé | Intégration — OCSP simulé |
| 5 | Certificat valide à la signature vérifiable plus tard | Intégration — horloge décalée |
| 6 | Horodatage absent ou invalide détecté | Intégration |
| 7 | Webhook falsifié refusé | Unitaire — vérification HMAC |
| 8 | Webhook rejoué ne signe pas deux fois | Intégration — idempotence |
| 9 | Callbacks identiques idempotents | Intégration |
| 10 | Signatures successives sans altérer l'existant | Intégration — PAdES incrémental |
| 11 | Modification ⇒ nouvelle version | Intégration |
| 12 | Version précédente conservée | Intégration |
| 13 | QR désigne le bon document et la bonne version | Intégration |
| 14 | Document confidentiel non exposé par le vérificateur | Sécurité |
| 15 | Aucune clé ni secret dans les journaux | Sécurité — inspection des logs |
| 16 | Image de signature copiée ne passe pas la validation | **Le test qui matérialise le principe n°1** |
| 17 | Pannes TSA/OCSP/HSM gérées proprement | Résilience |
| 18 | Les 124 tests existants restent verts | Non-régression |

**Méthode retenue** : extraire les décisions en fonctions pures et les couvrir de tests, comme
`decomptes.calc.ts`, `uploads.security.ts` et `regles.catalogue.ts`. Ce qui touche au réseau
(TSA, OCSP, prestataire) passe par l'adaptateur simulé.

---

## 6. Déploiement progressif

Sous drapeaux de fonctionnalité, jamais les 29 modules d'un coup.

| Lot | Portée | Prérequis |
|---|---|---|
| **L0** | Prérequis : MFA, file d'attente, journal immuable, comptes nominatifs | — |
| **L1** | Gel documentaire + PDF/A + empreinte du fichier | L0 |
| **L2** | Socle `signature-numerique` + adaptateur simulé + circuit + états | L1 |
| **L3** | Portail de vérification + QR | L2 |
| **L4** | e-Décompte et Certification de paiement | L2, **réponse ARPT** |
| **L5** | Marchés et Contrats | L4 |
| **L6** | Courriers, décisions, ordres de service | L5 |
| **L7** | PV et rapports approuvés | L5 |
| **L8** | Cachet institutionnel (catégorie B) | L2 + HSM |
| **L9** | Archivage probant et renouvellement | L4 |

**L0 à L3 ne dépendent pas de l'ARPT** et peuvent démarrer immédiatement. Ils représentent
l'essentiel de l'effort et sont utiles même si le choix du prestataire tarde.

---

## 7. Estimation par lots

| Lot | Charge indicative | Commentaire |
|---|---|---|
| **L0-org** | **hors charge technique** | Désignations, création des comptes personnels, saisie des qualités, composition des groupes, saisine de l'ARPT. **Ne dépend pas du développement.** |
| L0 | 14–20 j | MFA, file d'attente, **base de préproduction**, séparation comptes/groupes, versionnement des circuits |
| L1 | 8–12 j | Remplacement ou post-traitement de la chaîne PDF — poste le plus incertain |
| L2 | 15–20 j | Cœur du module |
| L3 | 5–7 j | Portail public + QR |
| L4 | 8–10 j | Premier module métier, le plus scruté |
| L5 à L7 | 4–6 j chacun | Décroissant, le socle étant en place |
| L8 | 6–8 j | Dépend de l'acquisition du HSM |
| L9 | 6–8 j | Tâches planifiées, supervision, **renouvellement des horodatages d'archive** |
| **L10** | **8–12 j** | Génération serveur des documents de catégorie A manquants et migration des 3 impressions navigateur |

**Total indicatif : 85 à 120 jours**, hors délais externes (ARPT, acquisition de certificats,
HSM, audit de certification au titre du décret D/2026/0159).

Ces chiffres supposent la pile **actuelle** (Node/TypeScript). Une réécriture Laravel les
multiplierait.

---

## 8. Fichiers qui seraient créés ou modifiés

**Créés — backend**
```
backend/src/modules/signature-numerique/
  ├── index.ts                          point d'entrée du module
  ├── orchestrateur.ts                  cycle de vie des demandes
  ├── provider.interface.ts             SignatureProviderInterface
  ├── provider.simule.ts                adaptateur de test — jamais en production
  ├── provider.prestataire.ts           adaptateur réel (après réponse ARPT)
  ├── finalisation.service.ts           gel du contenu
  ├── pdfa.service.ts                   rendu PDF/A
  ├── pades.service.ts                  B / B-T / B-LT / B-LTA
  ├── horodatage.service.ts             RFC 3161
  ├── certificat.service.ts             validation, instantané
  ├── revocation.service.ts             OCSP et CRL
  ├── verification.service.ts           vérification d'un document
  ├── cachet.service.ts                 cachet institutionnel
  ├── archivage.service.ts              dossier de preuves, renouvellement
  ├── qr.service.ts                     génération du QR
  ├── webhooks.routes.ts                callbacks authentifiés et idempotents
  ├── verification.routes.ts            API publique
  └── *.test.ts                         tests des fonctions pures
backend/src/lib/crypto-config.ts        algorithmes centralisés, jamais en dur
backend/prisma/sql/2026-XX-signature-*.sql   migrations additives
```

**Modifiés — backend**
```
backend/src/app.ts                      montage des nouvelles routes
backend/prisma/schema.prisma            extension sig_*, Delegation, Document
backend/src/lib/delegations.ts          périmètre, seuil, acte justificatif
backend/src/lib/audit.ts                chaînage par empreinte
backend/src/modules/signature/          marquage obsolète du mécanisme actuel
backend/src/modules/documents/          appel à la finalisation
backend/package.json                    dépendances PDF/A et crypto
```

**Créés / modifiés — frontend**
```
frontend/src/pages/SignaturePage.tsx           refonte : circuit, états, preuves
frontend/src/components/signature/             aperçu, consentement, MFA, QR
frontend/src/pages/VerificationPublique.tsx    portail de vérification
frontend/src/pages/DecomptesPage.tsx           « Finaliser » / « Envoyer pour signature »
```

**Documentation**
```
AUDIT-SIGNATURE-NUMERIQUE-2026-08-19.md   (ce jour)
PLAN-SIGNATURE-NUMERIQUE.md               (ce jour)
AGENTS.md                                 nouvelles règles absolues (clés, image ≠ preuve)
```

---

## 9. Mise à jour proposée d'`AGENTS.md`

Trois règles à ajouter à la section « Règles absolues » :

1. Une image de signature n'est **jamais** une preuve. La preuve est la signature
   cryptographique intégrée au PDF.
2. Aucune clé privée ne doit exister dans le dépôt, la base, Redis, un `.env`, le stockage
   documentaire ou le serveur applicatif — sans exception, y compris en développement.
3. L'adaptateur de signature simulé est interdit en production. Tout document qu'il produit
   porte une mention explicite d'absence de valeur juridique.

---

## 10. Questions ouvertes bloquantes

Reprises de l'audit §10 — les trois premières conditionnent tout développement de production :

1. Quels prestataires de confiance l'ARPT reconnaît-elle ?
2. Un certificat étranger est-il reconnu, et à quelles conditions ?
3. Quelle autorité d'horodatage est admise ?

**Question 4 — tranchée le 20/08/2026.** ~~Les comptes de fonction doivent-ils devenir
nominatifs ?~~ **Oui.** Compte personnel pour agir et signer, rôle/groupe pour la fonction. Reste
à exécuter, non à décider.

Questions internes encore ouvertes, à trancher par la Direction avant le lot L0 :

5. **Quel rôle pour Moïse SIDIBÉ et Famo MANSARÉ ?** La décision approuve leur nominativité mais
   ne leur affecte pas de rôle — contrairement à Moussa CAMARA, désigné DGA.
6. **Quel domaine de messagerie** pour les trois comptes à créer ? Les 20 comptes existants
   utilisent `@ageroute.gov.gn`, mais aucune adresse n'est présumée ici.
7. **Qui compose chaque groupe fonctionnel ?** MISSION, TECHNIQUE, DAF, UGP n'ont aujourd'hui
   aucun membre nommé.
8. **Quelle qualité exercée** inscrire pour chaque signataire ? La colonne `fonction` est vide
   pour les 20 comptes, alors qu'elle doit figurer dans la preuve.
9. **L'étape Entreprise doit-elle devenir une étape de workflow** dans les circuits internes ?
   Aujourd'hui le dépôt existe mais n'est pas horodaté dans la même chaîne que les validations.

Et une question de conception, préalable à toute écriture :

10. **Comment traiter les instances de workflow en cours** lors de l'insertion du DGA ?
    Versionnement des définitions, ou fenêtre sans dossier en cours ? Le versionnement est
    recommandé ; il est plus sûr et il servira à toutes les évolutions futures de circuit.

---

## 11. Réévaluation de la porte — 23/08/2026

Mandat du 20/08/2026 (« RÉÉVALUATION DE LA PORTE SIGNATURE-NUMÉRIQUE-01 »), appliqué le
23/08/2026. Veille réglementaire : `ANNEXE-VEILLE-REGLEMENTAIRE-2026-08-20.md`. Saisine :
`L0-SAISINE-ANDE.md`.

### 11.1 Trois portes indépendantes

```text
GO_CADRAGE_ARCHITECTURE          = OUVERT
GO_LABORATOIRE_HORS_PRODUCTION   = PRÊT — activation par SIG_MODE=laboratory + SIGNATURE_LAB_AUTORISE=oui
NO_GO_SIGNATURE_PRODUCTION       = MAINTENU — SIGNATURE_PRODUCTION_AUTORISEE ne doit pas être posé
```

La porte C ne peut être levée qu'avec, réunies : décret publié (copie numérotée, JO), arrêté
conjoint, liste officielle des prestataires agréés ANDE, point de publication de la liste de
confiance, prestataire retenu, TSA reconnue, confirmations écrites (signature distante, HSM
mutualisé), CP/CPS du prestataire, mécanismes officiels de révocation, désignation nominative de
tous les signataires, comptes actifs, qualités renseignées, délégations formalisées, certificats
acquis, validation juridique, validation des onze circuits, homologation et recette, plan de
conservation approuvé. **Aucun certificat EJBCA de laboratoire, aucune TSA SignServer de test,
aucune clé SoftHSM2 ne peut lever cette porte.**

### 11.2 Architecture de laboratoire retenue — implémentée

```text
ERP Node/Express  (lib/signature/)
    |
    +-- AdaptateurPrestataire        interfaces.ts
    |       +-- AdaptateurSimule     adaptateur-simule.ts      (dev, jamais probant)
    |       +-- AdaptateurSignServer adaptateur-signserver.ts  -> SignServer CE 7.3.2
    |                                                              +-- SoftHSM2 (PKCS#11 émulé)
    |                                                              +-- certificat EJBCA CE 9.3.7 de TEST
    +-- TSA                          SIG_TSA_URL, transmise au worker (RFC 3161 SignServer)
    +-- ServiceValidation            validation-dss.ts         -> DSS 6.1, construit depuis les sources
    |
    +-- configuration.ts   : lue dans l'ADMINISTRATION (parametres_metier, catégorie SIGNATURE)
    +-- orchestrateur.ts   : génération canonique -> filigrane -> empreinte -> signature -> validation -> conservation -> audit (transaction)
```

Remplacement par un prestataire agréé : `SIG_PRESTATAIRE_TYPE`, `SIG_PRESTATAIRE_URL`,
`SIG_TSA_URL`, `SIG_ANCRES_CONFIANCE` dans l'administration — **aucune ligne de code**. Les
workflows, la génération PDF, l'audit et le moteur de validation métier ne connaissent pas le
prestataire.

### 11.3 Responsabilités exactes

| Composant | Fait | Ne fait pas |
|---|---|---|
| EJBCA CE | racine de test (hors ligne après création de l'intermédiaire), intermédiaire, certificats nominatifs fictifs, CRL, OCSP | prestataire agréé |
| SignServer CE | signature PAdES côté serveur, API REST, TSA RFC 3161 de test, journal des opérations, clés dans SoftHSM2 | HSM certifié |
| SoftHSM2 | émulation PKCS#11, clés inexportables par le flux applicatif | HSM, et **interdit en production** |
| DSS | création/validation PAdES, chaînes, OCSP/CRL, jetons, rapport `TOTAL_PASSED / FAILED / INDETERMINATE` | dépendre du prestataire |
| ERP | orchestration, garde-fous, filigrane, conservation, audit | toucher une clé privée |

### 11.4 Garde-fous — implémentés et testés (`configuration.test.ts`)

| | Garde-fou | Où |
|---|---|---|
| G1 | `SIG_MODE = disabled` par défaut ; valeur inconnue → disabled | configuration.ts |
| G2 | `laboratory` exige `SIGNATURE_LAB_AUTORISE=oui` dans l'environnement | configuration.ts |
| G3 | `provider` exige `SIGNATURE_PRODUCTION_AUTORISEE=oui` — porte NO-GO | configuration.ts |
| G4 | `provider` refuse prestataire simulé, ancres vides, URL non HTTPS | configuration.ts |
| G5 | filigrane **imposé** hors `provider`, texte configurable, présence non | configuration.ts + pdf-dossier.ts (dans le flux de page, sous la signature) |
| G6 | CI : échec si SoftHSM2 / EJBCA CE / SignServer CE / URL `labo-` / `SIGNATURE_PRODUCTION_AUTORISEE` dans le manifeste de production | ci.yml |
| G7 | un compte non nominatif (sans prénom) ne peut pas signer | orchestrateur.ts |
| G8 | validation absente = `NON_VERIFIE` affiché, jamais un succès inventé | validation-dss.ts |

### 11.5 Niveau documentaire cible

Catégorie A : génération PDF côté serveur (faite : `genererDossierDecompte`), validation PDF/A
avant signature (**à faire**), PAdES-B pour les premiers tests → B-T avec TSA → B-LT → **B-LTA
seulement après validation réglementaire, TSA reconnue et politique de renouvellement**. La
conformité PDF/A d'un document signé n'est jamais déclarée : elle se vérifie après chaque
signature (**à faire**).

### 11.6 Matrice des signataires et calcul des certificats — état au 23/08/2026

Dédupliqué par **personne physique**, jamais par rôle. Exclus : groupes, comptes de fonction,
entreprises, comptes techniques, simulateurs, certificats serveur/TLS, certificats de
laboratoire.

| Rôle d'étape | Personne principale | Compte | Qualité | Certificat |
|---|---|---|---|---|
| DG | Moïse SIDIBÉ | `moise.sidibe@` (dormant) | Directeur Général | **confirmé à commander** |
| DAF | Famo MANSARÉ | `famo.mansare@` (dormant) | Directeur Administratif et Financier | **confirmé à commander** |
| DGA | Moussa CAMARA | à créer (rôle `DGA` absent) | Directeur Général Adjoint | **confirmé à commander** |
| DMC | Mohamed lamine Keita | `mohamed.keita@` | à renseigner | **confirmé à commander** |
| MISSION | *à désigner par chaque mission de contrôle* | — | — | à désigner |
| TECHNIQUE | *à désigner* | — | — | à désigner |
| UGP | *à désigner* (BM, UE) | — | — | à désigner |
| BAILLEUR / BUDGET / TRESOR / FER_AGT | *externes, à désigner* | — | — | délivrés côté organisme |
| BCRG | compte de fonction (décision 23/08) | `bcrg@` | — | **hors périmètre** |
| ENTREPRISE | mandataires à désigner (COLAS, SOGEA-SATOM, SORED) | — | — | à désigner + preuve de pouvoir |

```text
Nombre minimal   = 4   (personnes confirmées et distinctes : SIDIBÉ, MANSARÉ, CAMARA, Keita)
Nombre cible     = 4 + MISSION(≥1 par contrat de supervision) + TECHNIQUE(≥1) + UGP(≥1)
                     + externes (BAILLEUR, BUDGET, TRESOR, FER_AGT : ≥1 chacun) + mandataires (3 sociétés)
                 = 4 confirmés + au moins 10 à désigner  → ≥ 14
Nombre maximal   = cible + suppléants officiellement désignés (aucun à ce jour)
Certificats fictifs de laboratoire = 1 par compte nominatif existant ou créé pour les tests (4 aujourd'hui)
```

Hypothèse : un certificat par personne physique, sous réserve de la CP/CPS du prestataire et des
règles d'inscription de la qualité professionnelle. Aucune personne n'est inventée pour un rôle
vacant.
