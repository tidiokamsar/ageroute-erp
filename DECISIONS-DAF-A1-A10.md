# Décisions provisoires A1–A10 — règles financières

**Statut : PROVISOIRE — en vigueur jusqu'à arbitrage écrit de la DAF.**
**Date** : 23/08/2026 · **Décision** : « prendre les informations disponibles pour créer, et
prévoir un moyen de remplacement après ».

Ce document fige, règle par règle, **la valeur qui s'applique aujourd'hui** dans l'ERP et
**où la changer**. Toutes ces valeurs sont modifiables **sans déploiement** depuis
`Paramétrage → Règles financières (A1–A10)` : une règle approuvée prend effet à sa date
d'effet, pour les nouveaux décomptes seulement — les décomptes existants conservent leur
instantané (`reglesSnapshot`) et ne sont jamais recalculés rétroactivement.

`RECETTE-DAF.md` reste le guide de scénarios pour l'arbitrage définitif.

## Les règles en vigueur

| Règle | Clé | Valeur provisoire | Signification | Source |
|---|---|---|---|---|
| **A1** Assiette de la retenue de garantie | `RG_ASSIETTE_RETENUE_GARANTIE` | `TTC` | RG calculée sur HT + TVA + ARMP | pratique constatée dans les décomptes existants |
| **A2** Précompte TVA | `RG_FORMULE_PRECOMPTE_TVA` | `PRORATA_9_118` | TTC × 9/118, soit 9 % du HT | pratique constatée |
| | `RG_TAUX_PRECOMPTE_HT` | `9` | | |
| **A3** Redevance ARMP | `RG_TAUX_ARMP` / `RG_ARMP_ASSIETTE` / `RG_ARMP_INCLUSE_TTC` | `0.6` / `HT` / `true` | 0,6 % du HT, ajoutée au TTC puis déduite du net | pratique constatée |
| **A4** Plancher du net | `RG_NET_PLANCHER_ZERO` | `false` | un net négatif est possible (solde dû par l'entreprise) | comportement actuel |
| | `RG_REPORT_PENALITES` | `false` | pas de report sur le décompte suivant | |
| **A5** Pénalités de retard | `RG_PENALITE_MODE` | `SAISIE` | montant saisi, pas de formule automatique | comportement actuel |
| | `RG_PENALITE_TAUX_JOURNALIER` / `RG_PENALITE_PLAFOND_PCT` | `3000` (1/3000ᵉ par jour) / `100` | inactifs tant que le mode est SAISIE | usage CCAG |
| **A6** Avances | `RG_AVANCE_MODE` / `RG_TAUX_AVANCE` | `UNIQUE` / `20` | une avance de démarrage de 20 % | pratique constatée |
| **A7** Arrondi | `RG_ARRONDI_MODE` | `FRANC_PROCHE` | au franc le plus proche | comportement actuel |
| **A8** Séparation ordonnateur / comptable | `WF_ROLES_ORDONNANCEMENT` | `ADMIN,DAF` | la DAF ordonnance | **décision du 23/08/2026** |
| | `WF_ROLES_PAIEMENT` | `ADMIN,BCRG` | **la BCRG confirme le virement** — compte de fonction « Directeur Général BCRG », par décision explicite | **décision du 23/08/2026** |
| | `WF_SEPARATION_ORD_COMPTABLE` | `false` | contrôle automatique non activé — à activer quand la BCRG est opérationnelle | à arbitrer |
| **A9** Libellés d'états | `ETQ_MAPPINGS` | `{}` | libellés du code | différable |
| **A10** Conformité entreprise | `CF_SEUIL_CONFORME` / `CF_SEUIL_REGULARISER` / `CF_CURE_JOURS` | `70` / `40` / `0` | score ≥ 70 conforme, ≥ 40 à régulariser, pas de droit de cure | comportement actuel |

## Deux points que la DAF doit trancher en priorité

**Tolérance bancaire de 1 %.** La confirmation BCRG accepte un écart de 1 % entre montant
ordonnancé et montant réellement viré (`paiements.service.ts`). Ce seuil est **codé, pas
paramétré**. Il sera porté dans le registre (`WF_TOLERANCE_CONFIRMATION_PCT`) au prochain lot ;
en attendant, 1 % s'applique.

**Net négatif (A4).** Aujourd'hui un décompte peut avoir un net à payer négatif. Si la DAF veut
un plancher à zéro avec report, il suffit d'approuver `RG_NET_PLANCHER_ZERO = true` et
`RG_REPORT_PENALITES = true` dans l'admin — aucun développement.

## Comment remplacer une valeur

1. `Paramétrage → Règles financières (A1–A10)` → **Nouvelle règle**.
2. Choisir la clé, la valeur, la portée (`GLOBAL`, ou par bailleur / type de marché / marché),
   la date d'effet.
3. **Simuler** sur un montant de référence : l'écran montre avant/après ligne par ligne.
4. **Approuver** : la règle devient `APPROUVEE` et s'applique aux décomptes créés après la date
   d'effet. L'historique des versions est conservé.

Résolution quand plusieurs règles coexistent : `MARCHÉ > TYPE DE MARCHÉ > BAILLEUR > GLOBAL`,
puis date d'effet la plus récente, puis version la plus haute.

## Ce que ce document ne vaut pas

Il ne remplace pas la signature de la DAF. Il évite qu'en son absence l'ERP tourne sur des
valeurs que personne n'a regardées : les voici, noir sur blanc, avec leur origine.

| | Nom | Date | Signature |
|---|---|---|---|
| Pris connaissance — DAF | | | |
| Pris connaissance — DSI | | | |
