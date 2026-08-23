# Projet de saisine — Agence nationale de digitalisation de l'État (ANDE)

**Statut** : projet soumis à la Direction Générale. **Ne pas envoyer en l'état** — papier à
en-tête, validation de la Direction juridique, signature du Directeur Général.
**Remplace** `L0-SAISINE-ARPT.md` (20/08/2026) : le décret annoncé le 19 août 2026 désigne
l'**ANDE** comme autorité d'agrément des prestataires. L'ARPT reste en copie au titre des
décrets D/2026/0159 et D/2026/0160.

| | |
|---|---|
| **Destinataire principal** | Monsieur le Directeur général de l'ANDE |
| **Copie** | ARPT |
| **Copie technique** | ANSSI |
| **Copie** | Ministère chargé du Numérique |
| **Copie** | Ministère chargé de la Justice |

---

## Projet de courrier

> **Objet** : Demande d'informations relatives à la mise en œuvre de la signature électronique
> dans le système de gestion des marchés et décomptes de l'AGEROUTE
>
> **Références** : Loi L/2016/035/AN ; Décret D/2021/196 ; Décrets D/2026/0159 et D/2026/0160 ;
> décret du 19 août 2026 fixant les modalités d'application de l'article 1003 du Code civil
>
> Monsieur le Directeur général,
>
> L'Agence Nationale de Gestion des Infrastructures Routières (AGEROUTE) engage la
> dématérialisation de la chaîne de validation de ses décomptes, attachements, procès-verbaux de
> réception, contrats, avenants, ordres de service et certifications de paiement — documents qui
> engagent l'Agence, ses cocontractants et les bailleurs de fonds, et doivent conserver leur
> valeur probante pendant dix ans.
>
> L'Agence a retenu une architecture conforme au profil PAdES, s'appuyant sur un prestataire de
> services de confiance **agréé**, et a constitué un laboratoire interne, sans valeur juridique,
> pour en préparer l'intégration. Aucun prestataire n'a été retenu ni aucun certificat acquis :
> l'Agence souhaite au préalable s'assurer de la conformité de son dispositif au droit guinéen.
>
> Elle sollicite à cet effet votre autorité sur les points suivants.
>
> **Sur le cadre réglementaire**
> 1. Une copie officielle numérotée du décret du 19 août 2026.
> 2. La référence de sa publication au Journal officiel.
> 3. Une copie, ou le calendrier, de l'arrêté conjoint fixant les normes techniques et de
>    sécurité.
>
> **Sur les prestataires et la confiance**
> 4. La liste officielle et à jour des prestataires de services de certification agréés.
> 5. L'adresse officielle de publication de la liste de confiance, sa forme et sa fréquence de
>    mise à jour.
> 6. La liste des autorités d'horodatage reconnues.
> 7. Les conditions d'acceptation d'un prestataire étranger, notamment sous régime eIDAS.
>
> **Sur les modalités techniques**
> 8. Les conditions d'utilisation de la signature à distance.
> 9. Les conditions applicables aux modules matériels de sécurité mutualisés, et la norme
>    exigée (FIPS 140-3, Critères Communs, autre).
> 10. Le niveau PAdES attendu pour une conservation de dix ans, et les exigences de
>     renouvellement des preuves d'archivage.
> 11. Les référentiels d'homologation et d'audit applicables au système d'information lui-même,
>     et l'autorité compétente.
>
> **Sur la personne morale**
> 12. Le régime du cachet électronique d'une personne morale de droit public, distinct de la
>     signature d'une personne physique.
> 13. Les algorithmes et longueurs de clé prescrits ou proscrits.
> 14. Les exigences applicables aux signataires externes à l'Agence (missions de contrôle,
>     mandataires d'entreprises).
>
> L'Agence se tient à votre disposition pour présenter l'architecture envisagée et recevoir vos
> services.
>
> Je vous prie d'agréer, Monsieur le Directeur général, l'expression de ma considération
> distinguée.
>
> **Le Directeur Général de l'AGEROUTE**

---

## Ce que chaque réponse débloque

| Questions | Décision technique suspendue |
|---|---|
| 1–3 | levée de la réserve documentaire ; les exigences techniques deviennent opposables |
| 4–7 | choix du prestataire, contenu de `SIG_ANCRES_CONFIANCE` et de `sig_listes_confiance`, remplacement de l'adaptateur de laboratoire |
| 8–9 | ADR-03 — gestion des clés ; poste budgétaire HSM |
| 10 | niveau cible (`SIG_NIVEAU_PADES`) et politique de renouvellement |
| 11 | calendrier de mise en service ; éventuel lot d'homologation |
| 12–14 | catégorie B (cachet), mission de contrôle externe, mandataires |

**Sans réponse aux questions 1 à 6, la porte `NO_GO_SIGNATURE_PRODUCTION` ne peut pas être
levée.**

## Suivi

| Étape | Responsable | Date |
|---|---|---|
| Validation du projet | Direction juridique | |
| Signature | Directeur Général | |
| Transmission (ANDE + copies) | Secrétariat DG | |
| Accusé de réception | | |
| Réponse écrite | | |
| Restitution à l'équipe projet | | |
