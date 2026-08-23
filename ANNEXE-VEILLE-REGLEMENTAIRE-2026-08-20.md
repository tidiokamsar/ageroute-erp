# Annexe — Veille réglementaire sur la signature électronique en Guinée

**Date d'arrêté de la veille** : 20 août 2026 · **Mise à jour** : 23 août 2026
**Statut** : document de travail. Aucun élément ci-dessous ne vaut avis juridique.

## 1. Ce qui est établi, annoncé, ou non prouvé

La distinction est la substance de cette annexe. La confondre reviendrait à bâtir une preuve
juridique sur un article de presse.

| Élément | Statut | Preuve détenue |
|---|---|---|
| Loi L/2016/035/AN sur les transactions électroniques | **Officiel** | texte de loi |
| Décret D/2021/196 | **Officiel** | texte |
| Décrets D/2026/0159 et D/2026/0160 (référentiel de certification des réseaux et SI — ARPT) | **Officiel** | publication ARPT |
| **Décret du 19 août 2026** fixant les modalités d'application de l'article 1003 du Code civil (signature électronique) | **ANNONCÉ** | articles de presse concordants — **copie officielle numérotée et publication au Journal officiel EN ATTENTE** |
| Désignation de l'**ANDE** comme autorité d'agrément, de contrôle, de supervision et d'audit des prestataires | **ANNONCÉ** | idem |
| Durée minimale de conservation de dix ans | **ANNONCÉ** | idem — cohérent avec la décision interne du 20/08 |
| Arrêté conjoint fixant les normes techniques et de sécurité | **NON PRIS** (annoncé comme à venir) | aucun |
| Liste des prestataires agréés | **INEXISTANTE** à ce jour | aucune |
| Autorité d'horodatage reconnue | **INCONNUE** | aucune |
| Accréditation PKI / signature électronique — ANSSI | **Page officielle existante**, portée à préciser | anssi.gov.gn |

## 2. Le décret annoncé le 19 août 2026 — tel que rapporté

Selon les comptes rendus de presse (guinee114.com, guinee360.com, 19/08/2026), le texte :

- reconnaît à la signature électronique **la même force probante que l'écrit papier** si elle
  identifie le signataire et garantit l'intégrité du document ;
- exige qu'elle soit **authentique, infalsifiable, non réutilisable, intégrée au document,
  inaltérable et irrévocable** ;
- soumet les prestataires de services de certification à **agrément** ;
- désigne l'**ANDE** comme autorité d'agrément, de contrôle, de supervision et d'audit ;
- fixe une conservation **minimale de dix ans** ;
- renvoie les normes techniques et de sécurité à un **arrêté conjoint** des ministères
  compétents.

**Réserve documentaire.** Tant que la copie numérotée et la référence au Journal officiel ne
sont pas retrouvées, ce décret est enregistré avec le statut exact :

> DÉCRET ANNONCÉ LE 19 AOÛT 2026 — COPIE OFFICIELLE NUMÉROTÉE ET PUBLICATION AU JOURNAL
> OFFICIEL EN ATTENTE.

## 3. Conséquences pour l'ERP

| Exigence annoncée | Réponse dans la conception |
|---|---|
| identifie le signataire | certificat nominatif, compte personnel, rôle et qualité dans les attributs signés |
| intégrité, intégrée au document, inaltérable | PAdES : preuves **dans** le PDF, empreinte du fichier gelé |
| non réutilisable | signature liée au condensat du document, jamais d'image réutilisable |
| irrévocable | horodatage RFC 3161 ; révocation postérieure n'invalide pas une signature horodatée (ADR) |
| prestataire agréé | `SIG_MODE = provider` exige un prestataire non simulé, des ancres de confiance et la levée explicite de la porte — **aucun prestataire n'est retenu** |
| dix ans | `retention_until` à dix ans, renouvellement des horodatages d'archive, gel juridique |
| ANDE autorité | saisine redirigée vers l'ANDE (`L0-SAISINE-ANDE.md`) |

## 4. Sources consultées

- https://www.guinee114.com/2026/08/19/signature-electronique-le-president-doumbouya-fixe-les-modalites-dapplication-des-dispositions-de-larticle-1003-du-code-civil/
- https://www.guinee360.com/19/08/2026/guinee-mamadi-doumbouya-officialise-la-signature-electronique/
- https://ande.gov.gn/
- https://www.arpt.gov.gn/decret-d-2026-0160-prg-sgg-portant-adoption-du-referentiel-de-certification-des-reseaux-et-systemes-dinformation-relatif-aux-transactions-electroniques-en-republique-de-guinee/
- https://anssi.gov.gn/accreditation/PKI_Signature_electronique.html
- Références techniques : EJBCA Community (ejbca.org), SignServer Community (signserver.org,
  docs.keyfactor.com/signserver/latest/rest-interface), DSS (ec.europa.eu/digital-building-blocks,
  eSignature HUB).

Les pages web n'ont pas été archivées : une capture datée de chacune doit être jointe au dossier
de conformité par la Direction juridique.
