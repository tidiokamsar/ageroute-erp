# ADR-003 — La signature électronique est une capacité transversale, pas une application

**Date** : 23/08/2026 · **Statut** : ACCEPTÉ (décision utilisateur, exigence fonctionnelle
majeure « SIGNATURE INTÉGRÉE AUX DOCUMENTS »)

## Décision

> La signature électronique est une capacité transversale intégrée à chaque document et à
> chaque workflow métier. Le composant `signature-numerique` existe uniquement comme service
> technique interne. Il ne constitue pas une application autonome de recherche, de
> téléversement ou de signature des documents.

## Conséquences implémentées

- **Le signataire signe depuis la page du document** (décompte aujourd'hui ; PV, contrat,
  avenant, OS, certificat de paiement, décision, courrier : mêmes interfaces, à raccorder).
  Il ne téléverse rien, ne cherche rien, ne choisit aucun certificat, ne voit jamais une clé.
- **Bouton contextuel « Signer ce document »** : rendu par le serveur
  (`GET /signature-numerique/decomptes/:id/eligibilite`) seulement si tout est réuni — module
  actif, compte **nominatif** (les comptes fonctionnels sont techniquement refusés), étape du
  circuit **active pour ce rôle** (délégations comprises), séparation des tâches (RG9), aucun
  processus concurrent.
- **Deux temps obligatoires** : `preparer` gèle le PDF (ou reprend le dernier PDF signé de la
  chaîne), calcule l'empreinte, crée une demande à expiration (15 min, clé d'idempotence) ;
  `confirmer` exige la case de consentement (décochée par défaut, déclaration imposée mot pour
  mot) et la **réauthentification par mot de passe**, réserve la demande atomiquement
  (anti double-clic, anti-rejeu), **recalcule l'empreinte et la compare à celle présentée** —
  divergence = annulation avec le message imposé — puis appose, valide, conserve, clôture
  l'étape et notifie le signataire suivant.
- **Immutabilité et chaîne** (§6–§7) : dès la première signature, le document courant est le
  PDF signé conservé, jamais régénéré. Chaque signature suivante part de lui (rang n+1,
  `sha256Source(n+1) = sha256Signe(n)`, vérifié). Une signature précédente **FAILED** bloque et
  alerte ; **INDETERMINATE** bloque en mode prestataire, est toléré et consigné en laboratoire
  (chaîne de confiance de test non enrôlée — état attendu et affiché).
- **Correction métier après signature** : jamais de modification — annulation formelle de la
  version, conservation de l'historique signé, nouvelle version, nouveau circuit (procédure,
  non automatisée à ce stade).
- **Laboratoire** : filigrane imposé « SIMULATION — CERTIFICAT DE TEST — SANS VALEUR
  JURIDIQUE » dans le flux de chaque page ; garde-fous G1–G8 inchangés ; le remplacement du
  prestataire = configuration d'administration, **zéro écran métier à refaire**.

## Reste à faire (assumé)

- Zones de signature visibles prédéfinies dans les gabarits (cartouches actuels = informatifs).
- Rubrique « Mes tâches à signer » dédiée (les tâches passent aujourd'hui par « Mes tâches »
  du workflow, qui pointe le document métier).
- Page de vérification en lecture seule + QR (le rapport existe par API authentifiée).
- Raccordement des autres types de documents (PV, contrats…) aux mêmes interfaces.
- Signature PDF réellement incrémentale côté SignServer (propriété APPEND du worker) — à
  configurer à l'enrôlement EJBCA ; l'adaptateur simulé préserve trivialement les octets.
