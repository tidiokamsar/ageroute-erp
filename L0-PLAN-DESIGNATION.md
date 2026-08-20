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

| # | Manque | Sans lui, impossible de |
|---|---|---|
| D1 | **Domaine des trois comptes à créer** — la convention constatée est `@ageroute.gov.gn`, mais elle n'est pas confirmée | créer les comptes sans inventer une adresse |
| D2 | **Rôle de Moïse SIDIBÉ et de Famo MANSARÉ** | leur affecter un périmètre et des tâches |
| D3 | **Qualité exercée** des trois personnes, et des deux déjà nominatives | renseigner la preuve de signature |
| D4 | **Membres de chaque groupe** — MISSION, TECHNIQUE, DAF, UGP n'ont personne | opérer la bascule sans arrêter la chaîne |
| D5 | **Personnes habilitées** côté entreprises et organismes externes | faire signer hors AGEROUTE |

D1 à D3 suffisent pour créer les trois comptes personnels. D4 est indispensable **avant la
bascule**, pas avant la création.

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

| Groupe | Signataire désigné ? | Peut basculer ? |
|---|---|---|
| DG | Abdoulaye DABO | oui |
| DMC | Mohamed lamine Keita | oui |
| DGA | Moussa CAMARA | après étapes 2 et 4 |
| MISSION | — | **non** |
| TECHNIQUE | — | **non** |
| DAF | — | **non** |
| UGP | — | **non** |

Quatre groupes sur sept ne peuvent pas basculer aujourd'hui. La bascule est donc **groupe par
groupe**, jamais globale. Un basculement global le même jour arrêterait la validation des
décomptes.

---

## 5. Ce que ce plan ne fait pas

- Il ne crée aucun certificat : ils dépendent de la réponse de l'ARPT.
- Il n'active aucune signature électronique : c'est le lot L1 et suivants, non autorisés.
- Il ne supprime aucun compte : les comptes de fonction changent de nature, ils ne disparaissent
  pas.
- Il ne signe aucun document existant rétroactivement.

---

## 6. Journal d'exécution

À remplir au fur et à mesure. Une étape non datée est une étape non faite.

| Étape | Jouée sur copie le | Vérifiée le | Appliquée en production le | Par |
|---|---|---|---|---|
| 1 — Sauvegarde et copie | | | | |
| 2 — Trois comptes personnels | | | | |
| 3 — Qualités exercées | | | | |
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
