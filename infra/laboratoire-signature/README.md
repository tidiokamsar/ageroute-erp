# Laboratoire de signature — SANS VALEUR JURIDIQUE

Pile open source du mandat du 20/08/2026, professionnelle et **remplaçable par un prestataire
agréé** : le jour venu, seuls l'adaptateur prestataire, l'adaptateur TSA et les ancres de
confiance changent — workflows, génération PDF, audit et moteur de validation restent.

| Composant | Image | Rôle | Ce qu'il n'est PAS |
|---|---|---|---|
| EJBCA Community | `keyfactor/ejbca-ce:9.3.7` | PKI de **test** : racine hors ligne, intermédiaire, certificats nominatifs **fictifs**, CRL, OCSP | un prestataire agréé |
| SignServer Community | `keyfactor/signserver-ce:7.3.2` | prestataire et TSA **simulés** : signature PAdES serveur, RFC 3161, REST ; clés dans SoftHSM2 | un HSM certifié |
| DSS | construit depuis `esig/dss-demonstrations` 6.1 | validation PAdES, chaînes, OCSP/CRL, rapport `TOTAL_PASSED / FAILED / INDETERMINATE` | lié à un prestataire |

## Règles

- Versions **épinglées**. Jamais `latest`.
- Réseau `laboratoire-signature`, **aucun port publié**. L'ERP y accède par le réseau interne.
- **Interdit en production.** La CI échoue si `ejbca`, `signserver` ou `softhsm` apparaissent
  dans un manifeste de production, ou si une URL `labo-` figure dans la configuration de
  production.
- Tout certificat de laboratoire porte dans son sujet : `LABORATOIRE AGEROUTE — CERTIFICAT DE
  TEST — SANS VALEUR JURIDIQUE`. Tout PDF signé ici porte le filigrane
  `SIMULATION — SANS VALEUR JURIDIQUE` — imposé par l'ERP (garde-fou G5), pas par ce laboratoire.
- Aucune clé, aucun `.p12`, aucun mot de passe dans Git. `laboratoire.env` est hors dépôt.

## Démarrer

```bash
cp laboratoire.env.example laboratoire.env      # renseigner
docker compose -p labo-signature --env-file laboratoire.env up -d --build   # DSS se construit (~10 min)
./initialiser.sh                                 # clé SoftHSM2 + certificat de test + worker PDF + TSA
```

Puis dans l'ERP — **Paramétrage → Signature électronique** :

| Clé | Valeur laboratoire |
|---|---|
| `SIG_MODE` | `laboratory` |
| `SIG_PRESTATAIRE_TYPE` | `signserver` |
| `SIG_PRESTATAIRE_URL` | `http://labo-signserver:8080` |
| `SIG_PRESTATAIRE_WORKER` | `PDFSignerLab` |
| `SIG_TSA_URL` | `http://labo-signserver:8080/signserver/tsa?workerName=TimeStampLab` |
| `SIG_DSS_URL` | `http://labo-dss:8080/dss-webapp` |
| `SIG_ANCRES_CONFIANCE` | la racine de test imprimée par `initialiser.sh` |

Et dans l'environnement du backend : `SIGNATURE_LAB_AUTORISE=oui` — sans quoi le mode
laboratoire reste refusé (garde-fou G2). Le backend doit être rattaché au réseau
`laboratoire-signature` (voir `DEPLOIEMENT.md §11`).

## Ce que `initialiser.sh` fait — et ce qu'il ne fait pas encore

Il crée dans SignServer une clé **SoftHSM2** et un certificat **auto-émis de test** pour le
worker `PDFSignerLab`, ainsi qu'un worker `TimeStampLab` (TSA RFC 3161 de laboratoire), puis
imprime le certificat à coller dans `SIG_ANCRES_CONFIANCE`.

**Il n'enrôle pas encore le worker auprès d'EJBCA.** La chaîne complète — racine EJBCA hors
ligne → intermédiaire → certificat du worker, avec CRL et OCSP — est l'étape suivante ; elle
demande l'initialisation interactive d'EJBCA (profils, entité finale) que ce script ne fait pas à
l'aveugle. Jusque-là, DSS répondra `INDETERMINATE` sur les documents signés : **c'est exact**, la
chaîne n'est pas encore vérifiable, et l'ERP l'affiche tel quel.

## Arrêter, purger

```bash
docker compose -p labo-signature down           # conserve les volumes
docker compose -p labo-signature down -v        # PURGE — clés et CA de test perdues ; acceptable en laboratoire, seulement ici
```
