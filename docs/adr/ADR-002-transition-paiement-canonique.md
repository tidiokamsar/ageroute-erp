# ADR-002 — Transition canonique vers le statut PAYE

- Statut : proposé
- Date : 2026-08-21
- Portée : décomptes, paiements, circuit financier et traces de paiement

## Contexte

Le commit `d1563b3` permet à plusieurs routes indépendantes d'écrire le statut
`PAYE`. Elles n'appliquent pas les mêmes preuves : statut générique, trace
manuelle, montant ordonnancé, fin du circuit ou confirmation bancaire. Deux
ordres concurrents peuvent également dépasser le net à payer car le cumul est
contrôlé avant l'écriture, sans verrou.

La correction ne doit modifier aucune formule de décompte ni trancher une
règle DAF encore ouverte.

## Options comparées

1. Ajouter un contrôle local dans chacune des routes. Changement rapide, mais
   les invariants resteraient dupliqués et pourraient diverger de nouveau.
2. Conserver le monolithe et désigner une commande de paiement canonique,
   transactionnelle, avec politiques pures testables. Changement limité,
   réversible et cohérent avec l'architecture actuelle.
3. Déplacer le workflow complet dans des procédures et triggers PostgreSQL.
   Les invariants seraient proches des données, mais le couplage avec Prisma,
   le coût d'exploitation et la difficulté de test sont disproportionnés.

## Décision proposée

L'option 2 est retenue par incréments :

- la confirmation bancaire BCRG devient le seul écrivain du statut `PAYE` ;
- la création d'un ordre réserve un montant mais ne prouve pas son transfert ;
- la fin du circuit produit `ORDONNANCE`, pas `PAYE` ;
- le statut générique et les traces manuelles ne ferment plus un décompte ;
- les montants GNF sont reçus comme chaînes entières, avec compatibilité
  limitée aux nombres JSON entiers sûrs ;
- le décompte est verrouillé avant tout contrôle de cumul ;
- paiement, statut et audit sont écrits dans la même transaction ;
- le statut `PAYE` exige un cumul réel confirmé exactement égal au net à payer
  et aucun montant encore réservé.

## Décision métier encore ouverte

La configuration par défaut autorise actuellement `ADMIN,DAF` pour l'action
`PAIEMENT`, tandis que la route de confirmation exige `ADMIN,BCRG`. La matrice
finale doit être validée par la DAF avant modification ; le correctif technique
ne l'élargit pas implicitement.

## Preuves attendues

- tests unitaires sur montants supérieurs à `2^53`, cumul partiel, exact et
  dépassement ;
- test concurrent de deux ordres sur le même décompte avec PostgreSQL ;
- test de rollback lorsque l'audit échoue ;
- absence de toute écriture `PAYE` hors de la confirmation canonique ;
- suite backend et builds backend/frontend réussis.
