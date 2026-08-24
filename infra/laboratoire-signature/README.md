# Laboratoire de signature — SANS VALEUR JURIDIQUE

Pile open source du mandat du 20/08/2026, professionnelle et **remplaçable par un prestataire
agréé** : le jour venu, seuls l'adaptateur prestataire, l'adaptateur TSA et les ancres de
confiance changent — workflows, génération PDF, audit et moteur de validation restent.

| Composant | Image | Rôle | Ce qu'il n'est PAS |
|---|---|---|---|
| EJBCA Community | `keyfactor/ejbca-ce:9.3.7` | PKI de **test** : racine hors ligne, intermédiaire, certificats nominatifs **fictifs**, CRL, OCSP | un prestataire agréé |
| SignServer Community | `keyfactor/signserver-ce:7.3.2` | prestataire et TSA **simulés** : signature PAdES serveur, RFC 3161, REST ; clés dans un keystore PKCS#12 (l'image ne contient pas SoftHSM2 — écart au mandat consigné) | un HSM certifié |
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
./initialiser.sh                                 # keystore PKCS#12 + certificat de test + worker PDF + TSA
./enrolement-ejbca.sh                            # hiérarchie EJBCA : racine → intermédiaire → cachet du worker
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

## Les deux scripts

`initialiser.sh` crée dans SignServer un keystore **PKCS#12** et un certificat **auto-émis de
test** pour le worker `PDFSignerLab`, ainsi qu'un worker `TimeStampLab` (TSA RFC 3161 de
laboratoire), puis imprime le certificat à coller dans `SIG_ANCRES_CONFIANCE`.

`enrolement-ejbca.sh` (**fait en production de laboratoire le 24/08/2026**) remplace ce
certificat auto-émis par une vraie hiérarchie : AC racine de test (10 ans, **mise hors ligne**
après usage) → AC intermédiaire de test (5 ans, profil SUBCA) → certificat du cachet émis sur
**CSR** — la clé privée ne quitte jamais le conteneur SignServer. Les signatures embarquent
depuis lors la chaîne complète (3 certificats), que DSS lit et restitue nommément dans son
rapport.

`enrolement-ejbca-tsa.sh` (**fait le 24/08/2026**) fait de même pour la clé d'horodatage :
profil de certificat `TSA-Labo` (EKU `timeStamping` critique, exigence RFC 3161) et profil
d'entité importés depuis `profils-ejbca/` — EJBCA CE n'ayant ni configdump ni création de
profil par CLI, les XML committés sont la seule voie rejouable. La TSA s'active par la
propriété `TSA_WORKER` du PDFSigner : l'override `TSA_URL` par métadonnée de requête est
resté sans effet en CE 7.3.2 (prouvé — PDF signé sans jeton). L'adaptateur ERP n'annonce
d'ailleurs plus le niveau T que s'il **constate** le jeton RFC 3161 dans le PDF signé.

Limites assumées, dans l'ordre des travaux restants :
- L'ancienne racine keytool reste dans `SIG_ANCRES_CONFIANCE` (2e position) : elle couvre les
  signatures et horodatages apposés AVANT l'enrôlement EJBCA. La retirer casserait leur
  vérification. Les nouvelles signatures sont entièrement EJBCA (cachet **et** TSA).
- DSS répond `INDETERMINATE` / `NO_CERTIFICATE_CHAIN_FOUND` : il ne fait confiance qu'à la
  liste européenne (LOTL), pas à notre racine de test. C'est **exact et voulu** — un
  laboratoire ne doit pas se déclarer digne de confiance. `TOTAL_PASSED` viendra du prestataire
  agréé, ou d'un magasin de confiance DSS dédié au labo si l'on veut la répétition complète.

## Arrêter, purger

```bash
docker compose -p labo-signature down           # conserve les volumes
docker compose -p labo-signature down -v        # PURGE — clés et CA de test perdues ; acceptable en laboratoire, seulement ici
```
