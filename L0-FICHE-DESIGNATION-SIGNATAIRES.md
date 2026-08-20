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

### ⚠️ Point à trancher — deux titulaires pour le rôle DG

Moïse SIDIBÉ est désigné **DG**. Or `abdoulaye.dabo@ageroute.gov.gn` porte déjà ce rôle et
constitue l'un des trois seuls comptes nominatifs existants.

Trois lectures possibles, qui n'ont pas les mêmes conséquences :

| Lecture | Conséquence |
|---|---|
| Moïse SIDIBÉ est le Directeur Général en fonction | le compte d'Abdoulaye DABO doit être désactivé ou reversé vers un autre rôle |
| Abdoulaye DABO reste Directeur Général | le rôle de Moïse SIDIBÉ est à corriger |
| Les deux exercent, l'un par intérim ou délégation | l'intérim doit être formalisé comme une **délégation datée**, pas comme un second titulaire |

**Ce point doit être tranché avant création du compte.** Deux titulaires simultanés du rôle DG
signifieraient deux personnes habilitées à ordonnancer le même décompte — exactement ce que la
séparation des tâches doit empêcher. Le système ne saurait pas laquelle est légitime, et la
preuve de signature non plus.

---

## Partie 2 — Composition des groupes fonctionnels

Pour chaque groupe : qui en est membre, et lesquels de ces membres sont **autorisés à signer**.
Un membre non signataire peut consulter et préparer, mais pas valider.

### Groupes internes AGEROUTE

| Groupe | Compte fonctionnel remplacé | Membres — nom, prénom, identifiant | Signataires autorisés | Qualité exercée de chacun |
|---|---|---|---|---|
| **MISSION** | `mission@ageroute.gov.gn` | | | |
| **TECHNIQUE** | `technique@ageroute.gov.gn` | | | |
| **DMC** | `dmc@ageroute.gov.gn` | Mohamed lamine Keita *(déjà nominatif)* + | | |
| **DAF** | `daf@ageroute.gov.gn` | **Famo MANSARÉ** | Famo MANSARÉ | Directeur Administratif et Financier |
| **DGA** | *(rôle à créer)* | Moussa CAMARA | Moussa CAMARA | Directeur Général Adjoint |
| **DG** | `dg@ageroute.gov.gn` | **Moïse SIDIBÉ** + Abdoulaye DABO ⟶ ⚠️ *voir partie 1* | à trancher | Directeur Général |
| **UGP** | `ugp@ageroute.gov.gn` | | | |
| **AUDITEUR** | `auditeur@ageroute.gov.gn` | | *(consultation seule)* | |

### Groupes externes — désignation par l'organisme concerné

Ces personnes ne relèvent pas de l'AGEROUTE. Leur certificat sera délivré par leur propre
organisme. La Direction Générale saisit chaque organisme pour obtenir les désignations.

| Groupe | Organisme | Interlocuteur à saisir | Personnes désignées | Organisme saisi le |
|---|---|---|---|---|
| **BUDGET** | Direction du Budget — MEF | | | |
| **TRESOR** | Direction Générale du Trésor | | | |
| **FER_AGT** | Fonds d'Entretien Routier | | | |
| **BAILLEUR** | un représentant par bailleur | | | |
| **BCRG** | Banque Centrale | | | |

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
| `mission@`, `technique@`, `dmc@`, `daf@`, `dg@`, `ugp@` | groupe fonctionnel | réception et répartition des tâches, consultation du périmètre | **toute capacité de signature et de validation** |
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
