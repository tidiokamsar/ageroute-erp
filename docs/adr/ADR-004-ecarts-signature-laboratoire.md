# ADR-004 — Écarts du laboratoire de signature vis-à-vis de la cible, à documenter et à lever

**Date** : 27/08/2026 · **Statut** : accepté (constat) — les écarts sont assumés
pour le pilote, à lever avant toute valeur probante opposable.

## Contexte

Le module signature-numerique s'appuie sur le laboratoire EJBCA/SignServer
monté pour le pilote. Les démonstrations ont prouvé la chaîne complète
(enrôlement, cachet, TSA, validation DSS). Mais trois écarts avec la cible
n'étaient écrits nulle part : un auditeur ou un bailleur qui lit le code ou
les PDF produits pourrait croire à un niveau de garantie qui n'est pas atteint.

## Décision / constat

| # | Écart constaté | Cible | Conséquence | Lever avant |
|---|---|---|---|---|
| 1 | Signatures **PKCS#7 Adobe** (CAdES encapsulé en /CMS) | **PAdES** (PDF Advanced ESignature) | Le niveau PAdES est constaté à la validation DSS mais la production de sous-formulaires PAdES (LTV) n'est pas prouvée | Toute soumission à un bailleur exigeant eIDAS/PAdES |
| 2 | Clés en **PKCS#12** sur disque | **SoftHSM2** (clés non extractibles) | Le fichier .p12 est un secret transportable — compromission = usurpation du cachet | Production métier réelle |
| 3 | **Ancres de confiance jamais transmises à DSS** | chaîne racine→intermédiaire chargée dans le validateur | La validation affiche « chaîne incomplète » ou fait confiance par défaut : un PDF signé par une clé inconnue peut passer pour valide | Toute vérification externe |

## Conséquences

1. Les PDF signés du pilote portent une valeur **démonstrative**, pas
   probante — la mention « Document provisoire » reste de mise tant que
   l'écart 1 n'est pas levé.
2. Les secrets .p12 suivent le régime des secrets d'application (§6 AGENTS.md :
   jamais committés) mais doivent migrer vers SoftHSM2 avant production.
3. Le chargement des ancres dans DSS est un prérequis d'exploitation à
   ajouter au runbook de déploiement du laboratoire.
