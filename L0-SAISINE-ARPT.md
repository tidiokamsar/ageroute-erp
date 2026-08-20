# Projet de saisine de l'ARPT — Signature électronique de l'ERP AGEROUTE

**Statut** : projet soumis à la Direction Générale. **Ne pas envoyer en l'état** — à reprendre sur
papier à en-tête, à valider par la Direction juridique, puis à signer par le Directeur Général.
**Date de rédaction** : 20/08/2026
**Origine** : décision 7 de la clôture SIGNATURE-NUMÉRIQUE-01 — questions bloquantes n°1 à 3.

---

## Pourquoi cette saisine conditionne tout

Sept décisions techniques ne peuvent pas être prises sans réponse écrite de l'ARPT : le choix du
prestataire de certification, la recevabilité des certificats, l'autorité d'horodatage, les
algorithmes admis, le régime du cachet institutionnel, la norme de HSM et l'éventuelle
obligation d'audit préalable de l'ERP.

Tant que ces réponses manquent, une signature techniquement irréprochable resterait
**juridiquement incertaine en Guinée**. Aucun fournisseur ne doit être retenu ni intégré avant.

---

## Projet de courrier

> **Objet** : Demande d'informations relatives à la mise en œuvre de la signature électronique
> dans le système de gestion des marchés et décomptes de l'AGEROUTE
>
> **Références** : Loi L/2016/035/AN relative aux transactions électroniques ; Décret D/2021/196 ;
> Décrets D/2026/0159 et D/2026/0160
>
> Monsieur le Directeur Général,
>
> L'Agence Nationale de Gestion des Infrastructures Routières (AGEROUTE) exploite un système
> d'information de gestion des marchés, des décomptes et des paiements. Elle engage la
> dématérialisation de la chaîne de validation de ces documents, aujourd'hui signés sur support
> papier.
>
> Les documents concernés — décomptes, attachements, procès-verbaux de réception, contrats,
> avenants, ordres de service, certifications de paiement — engagent l'Agence, ses cocontractants
> et, pour plusieurs d'entre eux, les bailleurs de fonds internationaux qui financent les
> programmes routiers. Ils doivent conserver une valeur probante pendant dix ans.
>
> L'AGEROUTE entend retenir un dispositif conforme au profil PAdES Baseline B-LTA, assurant
> l'intégrité du document, l'identification du signataire, l'horodatage de la signature et la
> conservation à long terme des éléments de vérification.
>
> Afin de garantir la conformité du dispositif au droit guinéen **avant** tout engagement
> technique ou financier, l'Agence sollicite votre autorité sur les points suivants.
>
> **1. Prestataires de services de confiance**
> Quels prestataires de services de confiance sont, à ce jour, reconnus en République de Guinée
> pour la délivrance de certificats de signature électronique ? Où la liste officielle est-elle
> publiée, sous quelle forme, et à quelle fréquence est-elle mise à jour ?
>
> **2. Certificats étrangers**
> Un certificat délivré par un prestataire établi hors de Guinée — notamment sous régime eIDAS —
> est-il reconnu ? Sous quelles conditions, et au terme de quelle procédure ?
>
> **3. Horodatage**
> Existe-t-il une autorité d'horodatage qualifiée nationale ? À défaut, quelles autorités
> étrangères sont admises pour l'horodatage de documents publics guinéens ?
>
> **4. Paramètres cryptographiques**
> Quels algorithmes de signature et de condensation, et quelles longueurs de clé, sont prescrits
> ou proscrits par la réglementation en vigueur ?
>
> **5. Cachet de personne morale**
> Le cachet électronique d'une personne morale de droit public est-il reconnu comme distinct de
> la signature d'une personne physique ? Quel régime lui est applicable, et pour quels usages ?
>
> **6. Dispositif de conservation des clés**
> Quelle norme de module matériel de sécurité est exigée — FIPS 140-3, Critères Communs, autre ?
> La signature à distance sur un module mutualisé exploité par un prestataire est-elle admise, ou
> un dispositif individuel de création de signature est-il requis ?
>
> **7. Obligations pesant sur l'application**
> Au titre des décrets D/2026/0159 et D/2026/0160, quelles obligations s'imposent au système
> d'information lui-même ? Un audit ou une homologation préalable est-il requis avant la mise en
> service du dispositif de signature ? Auprès de quelle autorité, et selon quelle procédure ?
>
> L'Agence se tient à votre disposition pour présenter l'architecture envisagée et pour recevoir
> vos services.
>
> Je vous prie d'agréer, Monsieur le Directeur Général, l'expression de ma considération
> distinguée.
>
> **Le Directeur Général de l'AGEROUTE**

---

## Ce que chaque réponse débloque

| Question | Décision technique suspendue |
|---|---|
| 1, 2 | Choix du prestataire ; contenu de `sig_listes_confiance` ; écriture de `AdaptateurPrestataire` |
| 3 | `ServiceHorodatage` — sans TSA admise, pas de niveau B-T, donc pas de B-LTA |
| 4 | Paramètres cryptographiques du module — à rendre configurables, jamais figés dans le code |
| 5 | Traitement des documents de catégorie B (bordereaux, rapports bailleurs, exports) |
| 6 | ADR-03 — architecture de gestion des clés, et poste budgétaire correspondant |
| 7 | Calendrier de mise en service ; existence éventuelle d'un lot d'homologation |

**Sans réponse aux questions 1 à 3, aucun développement de production n'est possible.**

---

## Suivi

| Étape | Responsable | Date |
|---|---|---|
| Validation du projet de courrier | Direction juridique | |
| Signature | Directeur Général | |
| Transmission à l'ARPT | Secrétariat DG | |
| Accusé de réception | | |
| Réponse écrite reçue | | |
| Restitution à l'équipe projet | | |
