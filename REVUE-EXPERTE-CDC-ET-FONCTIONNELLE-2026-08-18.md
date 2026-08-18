# Revue experte du cahier des charges et feuille de route fonctionnelle — ERP AGEROUTE

**Date** : 18/08/2026 · **Auteur** : revue d'expertise indépendante (finance publique, marchés publics, entreprise étatique, ingénierie front/back)
**Objet** : revue du CDC (§4 à §23 + modules transverses) au regard du code réellement livré (master `v2026.08.4`), des standards internationaux et du contexte guinéen.
**Statut** : document de proposition — aucune formule financière n'est modifiée sans arbitrage DAF (règle §3.3 AGENTS.md).

---

## PARTIE I — REVUE DU CAHIER DES CHARGES

### 1. Ce que le CDC couvre bien (à préserver)

| Domaine | Force constatée dans le code |
|---|---|
| Chaîne décompte | Projets → Marchés → Attachements → Décomptes → Validation → Paiement complète et tracée (§7-16) |
| Workflows | Circuits par bailleur (BM/BAD/FER/Budget), 6 décisions, SLA, suspension DG — moteur double (workflow + BPMN) |
| Contrôle financier | Contrôles automatiques (§10) dont plafond marché+avenants, conformité entreprise bloquante, visas DAF/DG |
| Traçabilité | Audit trail systématique (§19), soft delete des sensibles, journal de sécurité signature |
| Montants | BigInt GNF de bout en bout, formule isolée et testée |
| Multitude d'acteurs | 14 rôles internes + portail entreprise, délégations d'intérim, affectations terrain |

### 2. Lacunes structurelles du CDC — par ordre de criticité financière

**L1. La passation amont est hors périmètre.** Le système commence au marché
notifié. Plan de passation, DAO, retraits, ouvertures des plis, évaluations,
rapports d'attribution, contrôle ARMP/DNTCP : rien n'est couvert. Or c'est là
que se joue la concurrence et le risque de corruption le plus élevé — un ERP
d'agence routière moderne couvre la donnée de bout en bout (benchmark :
TUNEP Tunisie, BASE Portugal, KONEPS Corée, eGP Ouganda).

**L2. L'engagement budgétaire n'existe pas.** Le module Financements gère des
enveloppes et allocations mais **aucun contrôle de disponibilité budgétaire**
n'est exigé avant signature de marché ou d'avenant. La séquence canonique PFM
(engagement → liquidation → ordonnancement → paiement, PEFA PI-23/24) n'est
pas modélisée : le système liquidé et ordonnance sur des crédits jamais
engagés formellement dans l'outil.

**L3. Le régime des garanties n'est pas couplé au cycle contractuel.** La
retenue de garantie est calculée dans les décomptes, les cautions existent
(§garanties), mais le CDC ignore : la correspondance avance ↔ caution d'avance,
la libération de la retenue en deux temps (réception provisoire / définitive
après période de garantie, usuellement 12 mois), la mainlevée automatique
déclenchée par la réception définitive — aujourd'hui tout est manuel.

**L4. Le risque de change est invisible.** Marchés financés en USD/EUR,
décaissements bailleurs en devises, comptes en GNF : le CDC est mono-devise.
Sans devise de contrat, taux d'ouverture et écarts de conversion tracés, les
états de décaissement bailleur seront faux.

**L5. Les règles financières ne sont pas spécifiées comme des règles.** Le
code contient des choix implicites non arbitrés (assiette RG et précompte sur
TTC, ARMP 0,6 % sur HT, précompte = 9/118 du TTC ≈ 9 % du HT, avance 20 %,
pénalités non plafonnées, net à payer non borné). Un CDC moderne définit un
**registre de règles de gestion (RG-xx)** : source juridique, formule,
paramètres, périmètre (type de marché × bailleur), contrôle bloquant ou
d'alerte, test automatisé. Le code cite déjà RG1-RG10 sans registre.

**L6. Plafonds légaux d'avenants non paramétrés.** Le contrôle
DEPASSEMENT_MONTANT borne marché+avenants au montant actualisé, mais le CDC
n'exige pas la règle du Code des marchés (plafond usuel d'avenants — à
confirmer DMP : souvent 25 % cumulé) ni la comptabilisation séparée des
avenants de +/− tranche.

**L7. Archivage légal non spécifié.** « Auditable dix ans » est affirmé mais
le CDC ne définit ni horodatage qualifié, ni WORM, ni valeur probante de la
signature électronique (loi guinéenne sur les transactions électroniques),
ni stratégie d'export pour les bailleurs (les pièces sont la mémoire du
programme routier).

**L8. Interopérabilité en pointillé.** SIGTIR via SharePoint (cassé en
production), géoportail en consultation seule. Le CDC devrait exiger : API
REST documentée, export OCDS (Open Contracting Data Standard — standard
international de transparence des marchés), interface d'engagement vers le
système comptable public, et remplacer l'intégration SharePoint par un flux
contrôlé.

### 3. Incohérences et points d'arbitrage à trancher (registre à soumettre)

| # | Point | Enjeu | Arbitre |
|---|---|---|---|
| A1 | Assiette retenue de garantie : TTC (code actuel) vs HT | Gonfle la retenue de ~18 % ; impact trésorerie entreprises | DAF + DMP |
| A2 | Assiette précompte TVA | Forme 9/118 du TTC = 9 % du HT — à documenter et faire valider DGI | DAF + DGI |
| A3 | ARMP 0,6 % : ajoutée au TTC puis déduite | Neutre sur le net mais fausse l'assiette A1 — couplage à trancher globalement | DAF + ARMP |
| A4 | Net à payer non borné | Pénalités > montant → net négatif ; report sur décompte suivant ? | DAF |
| A5 | Plafond et assiette des pénalités | Usuel : 1/3000e par jour, plafond 10 % — à confirmer et coder | DAF + DMP |
| A6 | Avance : 20 % unique vs démarrage/approvisionnement distincts | Deux natures distinctes au Code — garanties différentes | DAF + DMP |
| A7 | Calcul en flottant intermédiaire | À réécrire en entier pur avec arrondi au franc — sans changement de règle, pure technique | DAF (validation formelle) |
| A8 | Séparation ordonnateur/comptable | DAF liquide ET ordonnance ; le CDC doit refléter la séparation des fonctions (PEFA) | DG + DAF |
| A9 | Statuts BPMN vs décomptes (SOUMIS/DEPOSE doublons d'enum) | Unifier le vocabulaire d'états dans le CDC | DSI |
| A10 | Périmètre du score conformité | Critères, durées de validité, droit de cure de l'entreprise | DMC + juridique |

---

## PARTIE II — AMÉLIORATIONS FONCTIONNELLES PAR MODULE

### 4. Amont contractuel (nouveau)

- **F-AM1 — Plan de passation annuel** : saisie, arbitrages, suivi de
  consommation, alertes de dépassement de délai de lancement.
- **F-AM2 — Dossier d'achat électronique** : publication des avis (AO
  national/international, consultance), suivi des retraits/soumissions,
  grille d'évaluation pondérée, rapport d'attribution généré, chambre de
  recours tracée. Même « léger » (publication + évaluation), c'est le levier
  transparence n°1.
- **F-AM3 — Contrôles ARMP/DNTCP** : dépôt des demandes d'avis, suivi des
  délais de validation réglementaires, non-objection bailleur (liaison avec
  les circuits existants).

### 5. Budget et engagement (nouveau)

- **F-BU1 — Disponibilité budgétaire au moment de l'engagement** : contrôle
  bloquant marché/avenant contre l'enveloppe (le module Financements a déjà
  enveloppes/allocations/consommations — il manque le verrou).
- **F-BU2 — Imputation par ligne budgétaire** : chaque marché rattache une
  ou plusieurs imputations ; chaque décompte consomme et restitue.
- **F-BU3 — État d'exécution budgétaire** : engagé/liquidé/ordonnancé/payé
  par programme, source et bailleur — le rapport que la DAF et les bailleurs
  réclament en priorité.

### 6. Marchés / avenants / BPU

- **F-MA1 — Cycle de vie complet** : préparation → notification (OS0) →
  exécution → réceptions → apurement/clôture, avec échéancier contractuel et
  alertes de dérive calendaire (délai d'exécution, prorogations liées aux
  avenants).
- **F-MA2 — Plafond d'avenants paramétrable** (A6/L6) : contrôle bloquant +
  dérogation tracée avec motif.
- **F-MA3 — Courbes planifié/réel** : avancement physique (saisi) vs
  financier (décomptes) vs planning (OS/avenants) sur la même frise.
- **F-MA4 — BPU versionné** : liaison ligne de décompte ↔ article BPU ↔
  indice de révision, tolérances de quantités paramétrables.

### 7. Décomptes et finances (cœur financier)

- **F-DE1 — Moteur de calcul entier pur** (A7) : multiplier avant diviser,
  arrondi au franc explicité, **journal de calcul rejouable** (chaque décompte
  conserve ses paramètres d'entrée → re-calculabilité auditoire).
- **F-DE2 — Bordereau récapitulatif cumulatif** : la « situation du marché »
  officielle (total précédent / période / cumul / reste à payer / retenues
  cumulées) en PDF normalisé — pièce maîtresse des échanges avec les
  entreprises et bailleurs.
- **F-DE3 — Automatisation de la liasse des retenues** : à la réception
  provisoire → moitié de la RG libérable ; à la définitive (+12 mois) →
  solde + mainlevées de cautions générées en tâches à valider (F-GA2).
- **F-DE4 — Report des pénalités** (A4) : file de pénalités reportables,
  plafonnées, visible des deux parties via le portail.
- **F-DE5 — Multi-devise** (L4) : devise de contrat, taux d'ouverture par
  décompte, écarts de conversion tracés, états de décaissement par devise.
- **F-DE6 — Rapprochement paiement** : un décompte peut être payé en
  plusieurs tranches ; solde payé suivi ; rapprochement référence de
  virement ↔ avis de débit bancaire ; gestion des rejets.

### 8. Attachements / terrain

- **F-AT1 — PWA hors-ligne** : le génie civil se passe hors réseau ; cache
  local, synchronisation différée, photos EXIF (date/GPS native), anti-doublon
  par hachage.
- **-AT2 — Géo-contrôle contradictoire** : distance photo ↔ PK déclaré,
  contrôle de présence du représentant mission (horodatage), signature
  d'attachement à deux parties sur tablette.

### 9. Révision des prix

- **F-RV1 — Base d'indices** : import mensuel (source officielle à désigner),
  historisation, simulation avant application, récapitulatif par décompte.

### 10. Conformité entreprises / portail

- **F-CF1 — Registre documentaire à durées de validité** (A10) avec relances
  automatiques portail + email, et période de cure avant blocage.
- **F-CF2 — Publication du score et des marchés** (version anonymisée ou
  complète selon décision) — transparence type Open Contracting.
- **F-CF3 — Notifications portail** : dépôt reçu/rejeté/motivé, étape de
  circuit atteinte (le suivi temps réel existe, pas l'alerte).

### 11. Gouvernance, sécurité, exploitation

- **F-GO1 — 2FA obligatoire pour rôles financiers** (DAF, DG, ordonnanceurs).
- **F-GO2 — Actes de délégation formalisés** : référence de l'arrêté, date,
  plafonds éventuels — la suppléance actuelle est technique, pas juridique.
- **F-GO3 — Archivage WORM 10 ans** + horodatage, export bailleur packagé.
- **F-GO4 — Analytics anti-fraude** : règles simples en premier (validations
  < X minutes, concentration par validateur, montants anormalement ronds,
  IP partagées) alimentant le journal d'audit.
- **F-GO5 — Export OCDS** minimal (marchés, avenants, attributaires) pour la
  transparence et l'interopérabilité (L8).
- **F-GO6 — Rapports bailleurs automatisés** : Interim Financial Reports
  Banque mondiale, états de décaissement BAD, au format exigé ( Excell
  généré, pas ressaisi).

### 12. Plateforme / UX

- **F-UX1 — Impression officielle normalisée** : décompte, attachement, PV de
  réception, situation du marché — même gabarit, logo, paraphes.
- **F-UX2 — Recherche et filtres sauvegardés** par utilisateur ; exports
  Excel/CSV partout où il y a des tableaux.
- **F-UX3 — i18n français/anglais** (bailleurs) — préparation dès maintenant
  (libellés centralisés).
- **F-UX4 — Mode sombre et accessibilité** : contraste AA, navigation clavier
  — faible coût, forte légitimité institutionnelle.

---

## PARTIE III — FEUILLE DE ROUTE PROPOSÉE

| Vague | Horizon | Contenu | Prérequis |
|---|---|---|---|
| **V1 — Fiabiliser** | 0-3 mois | A1-A7 arbitrés et codés (moteur entier, bornes, plafond avenants), F-DE1/DE2, F-MA1 (cycle de vie), F-GO1 (2FA finance), F-GO6 (rapports bailleurs), F-UX1 | ateliers DAF/DMP/DGI |
| **V2 — Étendre l'amont** | 3-9 mois | F-BU1-BU3 (engagement budgétaire), F-AM1-AM3 (passation légère), F-DE3/DE4/DE6 (liasses, rapprochement), F-RV1, F-CF1/CF3 | décision politique e-passation |
| **V3 — Excellence** | 9-24 mois | F-AM2 complet (soumission électronique), F-DE5 (multi-devise), F-AT1/AT2 (terrain), F-GO3-GO5 (archivage, OCDS, anti-fraude), F-UX2-UX4 | infrastructure + formation |

**Critère de succès V1** : le premier décompte réel d'exploitation est calculé,
validé et payé dans l'outil, avec situation de marché imprimable et rapport
bailleur généré sans ressaisie.

---

## PARTIE IV — BENCHMARK "CE QUI SE FAIT AILLEURS"

| Référence | Ce qu'ils font | Transposable |
|---|---|---|
| TUNEP (Tunisie), BASE (Portugal), KONEPS (Corée) | Passation 100 % électronique, de l'avis d'appel d'offres au paiement | F-AM2 par étapes |
| OCDS (Open Contracting) | Standard de publication des marchés (données + pièces) | F-GO5, F-CF2 |
| PEFA (cadre d'évaluation PFM) | Séquence engagement/liquidation/ordonnancement/paiement, séparation ordonnateur-comptable | A8, F-BUx |
| Systèmes routiers (AGEFIR CI, programs BM/BAD) | RMMS : patrimoine + travaux + décaissements intégrés, rapports bailleurs standard | F-MA3, F-GO6 |
| e-GP Ouganda, ChileCompra | Tableaux de bord publics d'attribution, données ouvertes | F-CF2 |
| Bonnes pratiques archivage (secteur public FR/UE) | Horodatage qualifié, WORM, valeur probante | F-GO3 |

---

## Conclusion

Le socle technique est sain et le périmètre « exécution financière » solide.
Les trois défis de fond sont **institutionnels** : (1) faire trancher et
enregistrer les règles financières dans un registre RG-xx testé ; (2) remonter
le périmètre à la passation et à l'engagement budgétaire — là où se joue la
crédibilité du programme auprès des bailleurs ; (3) industrialiser la sortie
(rapports bailleurs, OCDS, archivage probant) pour que l'outil devienne la
source de vérité incontestable de la dépense routière guinéenne.
