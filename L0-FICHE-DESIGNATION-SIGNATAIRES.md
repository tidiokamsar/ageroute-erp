# Fiche de désignation des signataires — à compléter par la Direction Générale

**Statut** : formulaire de travail. **Aucune ligne n'est créée dans l'ERP tant que cette fiche
n'est pas complétée et validée.**
**Date de rédaction** : 20/08/2026
**Origine** : décision 1 du 20/08/2026 — nominativité des signataires.
**Retour attendu** : fiche complétée, datée et validée par la Direction Générale.

---

## Le principe à appliquer

> **Un compte personnel pour agir et signer. Un rôle ou groupe pour représenter la fonction.**

Un certificat de signature identifie une **personne physique**. Un compte de fonction ne peut donc
porter aucun certificat, et ne doit jamais apposer de signature. Il conserve son utilité — il
reçoit et répartit les tâches — mais la personne qui traite un dossier le signe avec **son**
compte.

---

## État des lieux — ce qui existe réellement

Vingt comptes sont configurés dans l'ERP. **Trois seulement sont personnels.**

| Compte personnel existant | Rôle actuel |
|---|---|
| `tidiane.diallo@ageroute.gov.gn` | ADMIN |
| `abdoulaye.dabo@ageroute.gov.gn` | DG |
| `mohamed.keita@ageroute.gov.gn` | DMC |

Les dix-sept autres sont des comptes de fonction ou de société. **Aucun d'eux ne pourra signer**
après application de la décision.

⚠️ **Trois précisions factuelles à porter à votre connaissance :**

1. Les comptes de **Moïse SIDIBÉ**, **Famo MANSARÉ** et **Moussa CAMARA** n'existent pas dans
   l'ERP. Ils sont à créer.
2. Le compte `mission.controle@…` n'existe pas non plus. Le compte fonctionnel réel de la mission
   de contrôle est **`mission@ageroute.gov.gn`**.
3. **Aucun** des vingt comptes n'a de fonction renseignée, alors que la qualité exercée doit
   figurer dans la preuve de signature.

---

## Partie 1 — Les trois comptes personnels à créer

**Désignations confirmées le 20/08/2026.** Domaine confirmé : `@ageroute.gov.gn`.

| Personne | Identifiant | Rôle | Qualité exercée (à confirmer) | État du compte |
|---|---|---|---|---|
| Moïse SIDIBÉ | `moise.sidibe@ageroute.gov.gn` | **DG** | Directeur Général | **créé le 20/08/2026 — dormant** |
| Famo MANSARÉ | `famo.mansare@ageroute.gov.gn` | **DAF** | Directeur Administratif et Financier | **créé le 20/08/2026 — dormant** |
| Moussa CAMARA | `moussa.camara@ageroute.gov.gn` | **DGA** | Directeur Général Adjoint | **en attente** — le rôle `DGA` n'existe pas encore |

**Ce que « dormant » veut dire.** Les deux comptes existent, portent leur identité et leur qualité,
et figurent au journal d'audit. Ils sont créés `actif = false`, avec un mot de passe aléatoire de
28 caractères qui n'a été ni conservé ni transmis : **personne ne peut s'y connecter**. La
désignation est donc enregistrée sans ouvrir d'accès.

Pour les mettre en service, un administrateur définit le mot de passe via « Réinitialiser mot de
passe » puis active le compte — au moment où la personne est effectivement accueillie, et pas
avant.

Les qualités exercées ci-dessus sont **déduites du rôle** et doivent être confirmées : elles
figureront dans la preuve de signature et seront lues dix ans plus tard. Si l'intitulé exact du
poste diffère, c'est lui qui doit être inscrit.

### ✅ Point tranché — Abdoulaye DABO n'est pas Directeur Général

Le rôle DG avait momentanément deux titulaires. La Direction a tranché le 20/08/2026 :
**Abdoulaye DABO est Directeur de la Structuration Financière.**

Aucun des 14 rôles existants ne correspondait. Un rôle **`DSF`** a été créé, **hors circuit** —
le circuit de validation en service n'a pas été touché :

- il ne figure dans **aucune** des 11 définitions de workflow ni dans le circuit financier ;
- il n'est pas soumis au périmètre d'affectation ;
- **aucune route ne l'autorise à valider, signer ou payer** ;
- modules ouverts en consultation : tableau de bord, BI, projets, marchés, décomptes, garanties,
  financements, paiements, circuit de paiement ;
- modules fermés : Mes tâches, journal d'audit, utilisateurs, paramétrage.

`abdoulaye.dabo@ageroute.gov.gn` porte désormais le rôle `DSF` et la qualité « Directeur de la
Structuration Financière ». Le rôle DG revient à Moïse SIDIBÉ seul.

Un test automatique échoue si `DSF` entre un jour dans une définition de circuit.

---

## Partie 2 — Composition des groupes fonctionnels

Pour chaque groupe : qui en est membre, et lesquels de ces membres sont **autorisés à signer**.
Un membre non signataire peut consulter et préparer, mais pas valider.

### Groupes internes AGEROUTE

| Groupe | Compte fonctionnel remplacé | Membres — nom, prénom, identifiant | Signataires autorisés | Qualité exercée de chacun |
|---|---|---|---|---|
| **TECHNIQUE** | `technique@ageroute.gov.gn` | coordinateurs de projet — à désigner | | Coordinateur de projet |
| **UGP** | `ugp@ageroute.gov.gn` | coordinateurs de projet — à désigner | | Coordinateur de projet |
| **DMC** | `dmc@ageroute.gov.gn` | Mohamed lamine Keita *(déjà nominatif)* + | | |
| **DAF** | `daf@ageroute.gov.gn` | **Famo MANSARÉ** | Famo MANSARÉ | Directeur Administratif et Financier |
| **DGA** | *(rôle à créer)* | Moussa CAMARA | Moussa CAMARA | Directeur Général Adjoint |
| **DG** | `dg@ageroute.gov.gn` | **Moïse SIDIBÉ** | Moïse SIDIBÉ | Directeur Général |
| **DSF** | *(rôle créé)* | Abdoulaye DABO | *(consultation seule — ne signe pas)* | Directeur de la Structuration Financière |
| **AUDITEUR** | `auditeur@ageroute.gov.gn` | **Abdoul Karim BAH** — `abdoul.bah@ageroute.gov.gn`, créé le 23/08/2026, dormant | *(consultation seule — lecture des décomptes, marchés, paiements)* | Auditeur interne |

**TECHNIQUE et UGP sont des coordinateurs de projet internes**, recrutés par l'AGEROUTE. Ils sont
créés par l'administrateur, qui leur assigne le rôle correspondant. Leur certificat est délivré
sous la responsabilité de l'Agence, comme pour la DAF ou la DMC.

### Groupes externes — désignation par l'organisme concerné

Ces personnes ne relèvent pas de l'AGEROUTE. Leur certificat sera délivré par leur propre
organisme ou sous sa responsabilité. La Direction Générale saisit chaque organisme.

| Groupe | Organisme | Qui désigne | Personnes désignées | Organisme saisi le |
|---|---|---|---|---|
| **MISSION** | Mission de contrôle *(prestataire externe)* | **la mission de contrôle désigne son chef de Mission** ; l'administrateur AGEROUTE crée le compte et lui assigne le rôle | | |
| **BUDGET** | Direction du Budget — MEF | le MEF | | |
| **TRESOR** | Direction Générale du Trésor | le Trésor | | |
| **FER_AGT** | Fonds d'Entretien Routier | le FER | | |
| **BAILLEUR** | un représentant par bailleur | chaque bailleur | | |
| **BCRG** | Banque Centrale | **décision du 23/08/2026 : compte de fonction « Directeur Général BCRG »**, pas de personne physique | `bcrg@ageroute.gov.gn`, créé le 23/08/2026, dormant | 23/08/2026 |

### ⚠️ BCRG — une exception assumée au principe de nominativité

La Direction a décidé le 23/08/2026 que la Banque Centrale intervient par un **compte de
fonction** (« Directeur Général BCRG »), sans personne physique désignée. C'est le seul rôle
dans ce cas. Conséquences à garder en vue :

- la confirmation bancaire — seule voie vers `PAYE` — sera **tracée au nom de la fonction**, pas
  d'une personne ; l'audit enregistre `confirmePar = bcrg@ageroute.gov.gn` ;
- **aucun certificat nominatif ne pourra être délivré** à ce compte le jour où la signature
  électronique sera mise en place : la confirmation BCRG restera hors du périmètre PAdES, ou
  devra être rattachée à une personne à ce moment-là ;
- le mot de passe de ce compte engage l'AGEROUTE et la BCRG à la fois : sa remise doit être
  formalisée avec la Banque Centrale, pas transmise par messagerie.

### ⚠️ MISSION est externe — trois conséquences

**1. Un chef de Mission par contrat de supervision, pas un pour l'Agence.** Chaque marché est
supervisé par une mission de contrôle, qui peut différer d'un marché à l'autre. Il y aura donc
**plusieurs comptes MISSION simultanés**, chacun limité à ses marchés. Le système le prévoit
déjà : `MISSION` fait partie des rôles à périmètre — sans affectation de marché, un compte
MISSION ne voit **rien**. L'administrateur doit donc, après création, affecter les marchés
supervisés ; sans cette étape le compte est créé mais aveugle.

**2. Le compte a la durée du contrat, pas celle d'une carrière.** Quand la mission de contrôle
change ou que son contrat s'achève, le compte doit être **désactivé** — et les documents qu'elle
a signés restent valables, puisque la signature est horodatée. Une revue périodique des comptes
MISSION actifs est à prévoir : c'est le point d'entrée du circuit, celui qui constate les
quantités réalisées.

**3. Le certificat pose une question à trancher.** Le chef de Mission signe le constat
contradictoire qui fonde le décompte, mais il n'est pas agent de l'AGEROUTE. Trois options :
certificat délivré à titre personnel par un prestataire reconnu ; certificat délivré sous la
responsabilité de la société de supervision ; ou certificat émis par l'Agence pour la durée du
contrat. Le choix relève de la Direction juridique et dépend des réponses de l'ARPT. Il est
ajouté au §10 de l'audit.

Dans tous les cas, le pouvoir du chef de Mission doit être **rattaché au contrat de supervision**,
au même titre que le pouvoir d'engager d'un mandataire d'entreprise.

### Entreprises titulaires

Pour chaque société, la personne habilitée à engager l'entreprise, avec la **pièce établissant
son pouvoir** — statuts, procuration, délibération.

| Société | Compte actuel | Personne habilitée | Pièce établissant le pouvoir | Pièce reçue le |
|---|---|---|---|---|
| COLAS Afrique — Agence Guinée | `colas@ageroute.gov.gn` | | | |
| SOGEA-SATOM | `sogea@ageroute.gov.gn` | | | |
| SORED Bâtiment & Routes | `sored@ageroute.gov.gn` | | | |
| Entreprise Titulaire *(compte générique)* | `entreprise@ageroute.gov.gn` | | | |

---

## Partie 3 — Ce que deviennent les comptes de fonction

Aucun compte n'est supprimé. Chacun change de nature.

| Compte | Devient | Conserve | Perd |
|---|---|---|---|
| `technique@`, `dmc@`, `daf@`, `dg@`, `ugp@` | groupe fonctionnel interne | réception et répartition des tâches, consultation du périmètre | **toute capacité de signature et de validation** |
| `mission@` | groupe **externe** — les chefs de Mission sont des prestataires | réception des dossiers à constater | **toute capacité de signature et de validation** |
| `budget@`, `tresor@`, `fer@`, `bailleur@` | groupe externe | réception des dossiers | **toute capacité de signature** |
| `colas@`, `sogea@`, `sored@`, `entreprise@` | groupe société | dépôt de pièces, suivi | **signature d'engagement** |
| `admin@`, `support@` | comptes techniques | administration | aucune signature métier — déjà le cas |
| `auditeur@` | groupe | consultation | inchangé |

---

## Partie 4 — Points de vigilance à anticiper

**La continuité de service.** Le jour où les comptes de fonction perdent la signature, tout
dossier en cours attend un compte personnel. Si les groupes MISSION, TECHNIQUE, DAF et UGP n'ont
aucun membre désigné à cette date, **la chaîne s'arrête**. Les désignations doivent être
complètes avant la bascule, pas après.

**Le DGA n'est jamais contourné.** En cas d'absence de Moussa CAMARA, le dossier attend, ou une
délégation formelle est établie. Le système ne sautera pas l'étape automatiquement, et aucun
compte fonctionnel ne pourra signer à sa place.

**Un certificat par personne, jamais partagé.** Le nombre de certificats à acquérir est égal au
nombre de signataires désignés dans cette fiche. C'est le chiffre qui déterminera le coût du
dispositif : il découle directement de ce que vous inscrirez ci-dessus.

**Les personnes déjà nominatives ne sont pas dispensées.** Abdoulaye DABO et Mohamed lamine Keita
ont un compte personnel, mais leur qualité exercée n'est pas renseignée et ils n'ont pas encore
de certificat.

---

## Récapitulatif — combien de certificats ?

À compléter une fois la fiche remplie. Ce chiffre est l'entrée du budget.

| Catégorie | Nombre de signataires |
|---|---|
| Signataires internes AGEROUTE | ______ |
| Signataires externes (MEF, Trésor, FER, bailleurs, BCRG) | ______ |
| Signataires entreprises | ______ |
| **Total des certificats nominatifs à acquérir** | **______** |

---

## Validation

| | Nom | Date | Signature |
|---|---|---|---|
| Fiche complétée par | | | |
| Validée par le Directeur Général | | | |

**Tant que cette fiche n'est pas validée, aucun compte, aucun rôle et aucun groupe ne sera créé
ni modifié dans l'ERP.**
