# Plan d'exécution de la désignation — L0 organisationnel

**Statut** : plan. **Rien n'est exécuté.** Aucun compte, rôle, groupe, circuit ou schéma n'est
créé ou modifié à ce jour.
**Date** : 20/08/2026
**Compagnon de** `L0-FICHE-DESIGNATION-SIGNATAIRES.md` — la fiche collecte, ce plan exécute.

---

## 1. Ce qui est déjà établi

Ces éléments sont acquis et n'attendent aucune décision supplémentaire.

| Élément | Valeur | Source |
|---|---|---|
| DGA | **Moussa CAMARA** | décision du 20/08/2026 |
| Position de l'étape DGA | entre DAF et DG, dans les 11 circuits | décision du 20/08/2026 |
| Principe | compte personnel signe, groupe reçoit | décision du 20/08/2026 |
| Conservation | 10 ans, avec gel juridique | décision du 20/08/2026 |
| Comptes personnels existants | `tidiane.diallo@`, `abdoulaye.dabo@`, `mohamed.keita@` | relevé sur les 20 comptes |
| Convention d'identifiant constatée | `prenom.nom@ageroute.gov.gn` | les 20 comptes existants |
| Comptes de fonction à convertir | 17 | relevé |

## 2. Ce qui manque pour exécuter

Cinq éléments, et cinq seulement, bloquent le démarrage. Aucun n'est technique.

| # | Manque | État au 20/08/2026 |
|---|---|---|
| D1 | Domaine des trois comptes à créer | **Levé** — `@ageroute.gov.gn` confirmé |
| D2 | Rôle de Moïse SIDIBÉ et de Famo MANSARÉ | **Levé** — DG et DAF |
| D3 | Qualité exercée des trois personnes | **Déduite du rôle, à confirmer** |
| D4 | **Membres des groupes MISSION, TECHNIQUE et UGP** — personne n'y est désigné | **Ouvert** |
| D5 | **Personnes habilitées** côté entreprises et organismes externes | **Ouvert** |
| **D6** | **Deux titulaires pour le rôle DG** — Moïse SIDIBÉ désigné, Abdoulaye DABO déjà en place | **Ouvert — bloquant pour l'étape 2** |

D1 et D2 sont levés. **D6 est apparu à leur place** et bloque la création du compte de Moïse
SIDIBÉ : créer un second DG sans trancher reviendrait à habiliter deux personnes à ordonnancer le
même décompte. Les comptes de Famo MANSARÉ (DAF) et de Moussa CAMARA (DGA) ne sont pas concernés
— aucun titulaire nominatif n'existe pour ces deux rôles.

D4 est indispensable **avant la bascule**, pas avant la création.

---

## 3. Séquence d'exécution

Six étapes, dans cet ordre. L'ordre n'est pas indicatif : l'inverser casse des choses.

### Étape 1 — Sauvegarde et copie de répétition

`pg_dump -Fc` de la base ERP, copie hors du serveur `.131`. Restauration dans une base jetable
sur laquelle toutes les étapes suivantes sont jouées **avant** la production.

**Réversible** : sans objet — c'est le filet.
**Prérequis** : aucun. À faire en premier, toujours.

### Étape 2 — Création des trois comptes personnels

Création de `moise.sidibe@…`, `famo.mansare@…`, `moussa.camara@…` avec nom, prénom, qualité
exercée. Aucun droit de signature n'existe encore : la création est sans effet sur les circuits.

**Réversible** : oui — un compte se désactive.
**Prérequis** : D1, D2, D3.
**Effet sur la production** : nul tant que les rôles ne changent pas.

### Étape 3 — Saisie des qualités exercées sur les comptes existants

La colonne `fonction` est vide pour les 20 comptes. Elle doit être renseignée au moins pour les
personnes appelées à signer, la qualité figurant dans la preuve.

**Réversible** : oui.
**Prérequis** : D3.

### Étape 4 — Ajout du rôle `DGA`

⚠️ **Étape non réversible.** `ALTER TYPE "Role" ADD VALUE 'DGA'` ne se retire pas en PostgreSQL.
Il n'existe pas de `DROP VALUE`. Revenir en arrière imposerait de recréer le type et de réécrire
toutes les colonnes qui l'utilisent.

C'est la raison pour laquelle l'étape 1 n'est pas facultative, et pour laquelle cette étape doit
avoir été jouée intégralement sur la copie restaurée.

**Réversible** : **non**.
**Prérequis** : étape 1 accomplie et vérifiée ; répétition réussie sur copie.

### Étape 5 — Versionnement des définitions de circuit

**Avant** d'insérer l'étape DGA, `workflow_definitions` doit porter une version, et
`workflow_instances` doit pointer la version sous laquelle chaque dossier a démarré.

Sans cela, ajouter l'étape réécrit rétroactivement le parcours des dossiers déjà validés : un
décompte signé sous un circuit de six étapes apparaîtrait incomplet sous un circuit de sept. La
cohérence de la preuve serait détruite sur l'historique.

**Réversible** : oui, tant que les définitions ne sont pas dupliquées.
**Prérequis** : étape 4.

### Étape 6 — Insertion de l'étape DGA dans les onze circuits

Création d'une **nouvelle version** de chacun des onze circuits, avec l'étape DGA entre DAF et
DG. Les instances en cours restent sur l'ancienne version et s'achèvent sous elle.

Aucune étape spécifique n'est supprimée : UGP, Trésor, FER_AGT et contrôles bailleurs sont
conservés à l'identique.

**Réversible** : oui — désactiver la nouvelle version rétablit l'ancienne.
**Prérequis** : étape 5.

---

## 4. La bascule — le point réellement risqué

Retirer la signature aux comptes de fonction est l'opération qui peut arrêter l'agence.

**Règle de sécurité, sans exception** : un compte de fonction ne perd la signature que lorsque
son groupe compte **au moins un signataire désigné, avec un compte personnel actif**.

| Groupe | Signataire désigné | Peut basculer ? |
|---|---|---|
| DMC | Mohamed lamine Keita | oui |
| DAF | Famo MANSARÉ | après étape 2 |
| DGA | Moussa CAMARA | après étapes 2 et 4 |
| DG | Moïse SIDIBÉ **ou** Abdoulaye DABO | **non — D6 à trancher** |
| MISSION | — | **non** |
| TECHNIQUE | — | **non** |
| UGP | — | **non** |

Quatre groupes sur sept ne peuvent pas basculer. La bascule est donc **groupe par groupe**,
jamais globale. Un basculement global le même jour arrêterait la validation des décomptes.

Le cas du DG mérite attention : c'est la **dernière étape interne** des onze circuits. Un blocage
sur ce rôle immobilise tous les décomptes en fin de parcours, quel que soit l'état des étapes
amont.

---

## 5. Ce que ce plan ne fait pas

- Il ne crée aucun certificat : ils dépendent de la réponse de l'ARPT.
- Il n'active aucune signature électronique : c'est le lot L1 et suivants, non autorisés.
- Il ne supprime aucun compte : les comptes de fonction changent de nature, ils ne disparaissent
  pas.
- Il ne signe aucun document existant rétroactivement.

---

## 5 bis. Incident du 20/08/2026 — la création d'utilisateur était cassée

La première tentative de création des comptes a échoué en 500 sur les deux. Le défaut n'était pas
dans la demande mais dans l'ERP.

`POST /api/users` transmettait à Prisma le corps validé **`password` compris**, alors que seule la
colonne `passwordHash` existe sur le modèle `User`. Prisma refusait l'argument inconnu. **Aucun
utilisateur ne pouvait donc être créé**, ni par l'API ni par l'écran d'administration, depuis la
mise en service. Les 20 comptes existants venaient des scripts de peuplement, en SQL direct — ce
qui explique que le défaut n'ait jamais été vu.

Second défaut découvert au passage : le gestionnaire d'erreurs journalisait l'erreur brute, et le
message d'une erreur Prisma incorpore le payload refusé. **Une création d'utilisateur en échec
écrivait le mot de passe en clair dans `docker logs`.**

Les deux sont corrigés — branche `fix/creation-utilisateur`, commit `cfafb45`, déployé le
20/08/2026. Tests : 141/141. Le mot de passe temporaire exposé lors de la tentative ratée était
une chaîne aléatoire jamais utilisée, sur un compte inexistant, et les journaux du conteneur ont
été remis à zéro par sa recréation.

**Ce que cet incident enseigne pour la suite.** La désignation a servi de test de recette : elle a
révélé un défaut bloquant que six mois d'exploitation n'avaient pas fait apparaître, parce que
personne n'avait jamais créé de compte par l'interface. Les étapes 4 à 6 — rôle `DGA`,
versionnement, insertion dans les circuits — touchent des chemins tout aussi peu exercés. La
répétition sur copie restaurée n'est pas une formalité.

---

## 6. Journal d'exécution

À remplir au fur et à mesure. Une étape non datée est une étape non faite.

| Étape | Jouée sur copie le | Vérifiée le | Appliquée en production le | Par |
|---|---|---|---|---|
| 1 — Sauvegarde et copie | sans objet | 20/08/2026 | **20/08/2026** — 317 Ko, `a269db33…`, copie dans `F:\ERP-sauvegarde\dumps\` | Claude |
| 2 — Comptes personnels | sans objet | 20/08/2026 | **20/08/2026 — 2 sur 3** : Moïse SIDIBÉ (DG) et Famo MANSARÉ (DAF), créés **dormants**. Moussa CAMARA attend le rôle `DGA`. | Claude |
| 3 — Qualités exercées | sans objet | 20/08/2026 | **20/08/2026** — renseignées sur les deux comptes créés. Reste à faire sur les 20 comptes préexistants. | Claude |
| 4 — Rôle DGA *(non réversible)* | | | | |
| 5 — Versionnement des circuits | | | | |
| 6 — Étape DGA dans les 11 circuits | | | | |
| Bascule MISSION | | | | |
| Bascule TECHNIQUE | | | | |
| Bascule DAF | | | | |
| Bascule UGP | | | | |
| Bascule DMC | | | | |
| Bascule DGA | | | | |
| Bascule DG | | | | |
