#!/usr/bin/env bash
# Enrôlement EJBCA de la TSA — LABORATOIRE, SANS VALEUR JURIDIQUE.
#
# Suite d'enrolement-ejbca.sh (qui doit avoir tourné : hiérarchie racine →
# intermédiaire en place). Émet le certificat d'horodatage (EKU timeStamping
# CRITIQUE + KU digitalSignature, exigences RFC 3161) pour la clé `tsakey` du
# keystore SignServer, sur CSR — la clé privée ne sort jamais du conteneur.
#
# Exécuté avec succès le 24/08/2026. Particularités durement acquises :
# - EJBCA CE n'a NI configdump NI création de profil par CLI : les deux profils
#   (certificat + entité finale) s'importent depuis les XML committés dans
#   profils-ejbca/ — générés à la main d'après le format UpgradeableDataHashMap
#   (version 15.0 : le mécanisme d'upgrade comble les champs postérieurs, les
#   champs antérieurs — validity, keyusage… — doivent être DANS le XML, sinon
#   NPE à l'émission).
# - CertificateProfile.ANYCA (1) est refusé à l'émission : availablecas doit
#   porter l'ID réel de l'AC intermédiaire. Si l'ID diffère (relabo neuf),
#   le script le corrige via editcertificateprofile.
# - L'override TSA_URL par métadonnée de requête est SANS EFFET en CE 7.3.2 :
#   la TSA s'active par la propriété TSA_WORKER du PDFSigner (appel interne).
set -euo pipefail

EJBCA="docker exec labo-ejbca /opt/keyfactor/bin/ejbca.sh"
SS="docker exec labo-signserver"
SSCLI=/opt/signserver/bin/signserver
KS=/mnt/persistent/labo-keys.p12
PIN=labo-pin-de-test-1234
MDP_ENROLEMENT=labo-enrolement-2026
ICI="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. Import des profils TSA-Labo (certificat + entité finale) =="
docker exec labo-ejbca mkdir -p /tmp/import-tsa
docker cp "$ICI/profils-ejbca/certprofile_TSA-Labo-641000001.xml" labo-ejbca:/tmp/import-tsa/
docker cp "$ICI/profils-ejbca/entityprofile_TSA-Labo-641000002.xml" labo-ejbca:/tmp/import-tsa/
$EJBCA ca importprofiles -d /tmp/import-tsa || true   # « already exist » toléré (idempotence)

echo "== 2. availablecas du profil = ID réel de l'AC intermédiaire =="
INTERID=$($EJBCA ca listcas 2>&1 | grep -A1 "CA Name: AC-Intermediaire-Labo" | grep " Id:" | grep -oE -- "-?[0-9]+$")
$EJBCA ca editcertificateprofile TSA-Labo --field availableCAs "--value=$INTERID"

echo "== 3. CSR de la clé d'horodatage (la clé ne sort pas) =="
$SS keytool -certreq -alias tsakey -keystore $KS -storetype PKCS12 -storepass $PIN -file /tmp/tsakey.csr
docker cp labo-signserver:/tmp/tsakey.csr /tmp/tsakey.csr
docker cp /tmp/tsakey.csr labo-ejbca:/tmp/tsakey.csr

echo "== 4. Émission (profil TSA-Labo : EKU timeStamping critique) =="
$EJBCA ra addendentity --username labo-tsa \
  --dn "CN=Horodatage de TEST AGEROUTE - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN" \
  --caname AC-Intermediaire-Labo --type 1 --token USERGENERATED \
  --password "$MDP_ENROLEMENT" --certprofile TSA-Labo --eeprofile TSA-Labo \
  || $EJBCA ra setendentitystatus --username labo-tsa -S 10   # ré-exécution : repasser à NEW
$EJBCA createcert --username labo-tsa --password "$MDP_ENROLEMENT" -c /tmp/tsakey.csr -f /tmp/tsakey-cert.pem

echo "== 5. Chaîne complète dans le keystore, TSA_WORKER, rechargement =="
$EJBCA ca getcacert --caname AC-Racine-Labo -f /tmp/ac-racine.pem
$EJBCA ca getcacert --caname AC-Intermediaire-Labo -f /tmp/ac-inter.pem
for f in tsakey-cert.pem ac-inter.pem ac-racine.pem; do docker cp labo-ejbca:/tmp/$f /tmp/$f; done
cat /tmp/tsakey-cert.pem /tmp/ac-inter.pem /tmp/ac-racine.pem > /tmp/chaine-tsakey.pem
docker cp /tmp/chaine-tsakey.pem labo-signserver:/tmp/chaine-tsakey.pem
$SS keytool -importcert -alias tsakey -file /tmp/chaine-tsakey.pem -keystore $KS -storetype PKCS12 -storepass $PIN -noprompt
$SS $SSCLI setproperty PDFSignerLab TSA_WORKER TimeStampLab
$SS $SSCLI reload all
$SS $SSCLI getstatus complete TimeStampLab | grep "Subject DN"

cat <<'FIN'
== FAIT. Vérification recommandée ==
Signer un PDF via PDFSignerLab puis vérifier que le CMS contient l'OID
signature-time-stamp (1.2.840.113549.1.9.16.2.14) — l'adaptateur ERP le fait
désormais lui-même et n'annonce le niveau T que s'il constate le jeton.
FIN
