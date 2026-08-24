#!/usr/bin/env bash
# Enrôlement EJBCA — LABORATOIRE, SANS VALEUR JURIDIQUE.
#
# Remplace la chaîne keytool auto-générée par une vraie hiérarchie d'AC gérée
# par EJBCA CE : AC racine de test → AC intermédiaire de test → certificat du
# worker PDFSignerLab (CSR émis depuis le keystore SignServer, clé privée
# JAMAIS sortie du conteneur SignServer).
#
# Exécuté avec succès le 24/08/2026 sur le serveur .131 (voir README §Enrôlement).
# Rejouable après un `docker compose down -v` du SEUL laboratoire.
#
# La TSA (TimeStampLab) reste volontairement sur la chaîne keytool d'origine :
# EJBCA exige un profil de certificat avec EKU timeStamping, non créé ici.
# Tant que ce profil n'existe pas, l'ancienne racine keytool doit RESTER dans
# SIG_ANCRES_CONFIANCE (sinon les horodatages deviennent invérifiables).
set -euo pipefail

EJBCA="docker exec labo-ejbca /opt/keyfactor/bin/ejbca.sh"
SS="docker exec labo-signserver"
KS=/mnt/persistent/labo-keys.p12
PIN=labo-pin-de-test-1234   # PIN de TEST, assumé public — laboratoire uniquement
MDP_ENROLEMENT=labo-enrolement-2026

DN_RACINE="CN=LABORATOIRE AGEROUTE - AC RACINE DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"
DN_INTER="CN=LABORATOIRE AGEROUTE - AC INTERMEDIAIRE DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"
DN_CACHET="CN=Cachet de signature de TEST AGEROUTE - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"

echo "== 1. AC racine (auto-signée, 10 ans) =="
$EJBCA ca init --caname AC-Racine-Labo --dn "$DN_RACINE" \
  --tokenType soft --tokenPass null --keyspec 3072 --keytype RSA \
  -v 3650 --policy null -s SHA256WithRSA

ROOTID=$($EJBCA ca listcas 2>&1 | grep -A1 "CA Name: AC-Racine-Labo" | grep " Id:" | grep -oE -- "-?[0-9]+$")
echo "   id racine : $ROOTID"

echo "== 2. AC intermédiaire (signée par la racine, 5 ans) =="
# ATTENTION : -certprofile prend UN SEUL tiret (particularité de la CLI EJBCA).
$EJBCA ca init --caname AC-Intermediaire-Labo --dn "$DN_INTER" \
  --tokenType soft --tokenPass null --keyspec 3072 --keytype RSA \
  -v 1825 --policy null -s SHA256WithRSA --signedby "$ROOTID" -certprofile SUBCA

echo "== 3. CSR depuis le keystore SignServer (la clé ne sort pas) =="
$SS keytool -certreq -alias signkey -keystore $KS -storetype PKCS12 -storepass $PIN -file /tmp/signkey.csr
docker cp labo-signserver:/tmp/signkey.csr /tmp/signkey.csr
docker cp /tmp/signkey.csr labo-ejbca:/tmp/signkey.csr

echo "== 4. Émission du certificat du cachet par l'intermédiaire =="
$EJBCA ra addendentity --username labo-signer --dn "$DN_CACHET" \
  --caname AC-Intermediaire-Labo --type 1 --token USERGENERATED --password "$MDP_ENROLEMENT"
$EJBCA createcert --username labo-signer --password "$MDP_ENROLEMENT" -c /tmp/signkey.csr -f /tmp/signkey-cert.pem

echo "== 5. Export des AC et import de la chaîne complète dans le keystore =="
$EJBCA ca getcacert --caname AC-Racine-Labo -f /tmp/ac-racine.pem
$EJBCA ca getcacert --caname AC-Intermediaire-Labo -f /tmp/ac-inter.pem
for f in ac-racine.pem ac-inter.pem signkey-cert.pem; do docker cp labo-ejbca:/tmp/$f /tmp/$f; done
awk "/BEGIN CERT/,/END CERT/" /tmp/ac-racine.pem > /tmp/racine-ejbca-seule.pem
cat /tmp/signkey-cert.pem /tmp/ac-inter.pem /tmp/ac-racine.pem > /tmp/chaine-signkey.pem
docker cp /tmp/ac-racine.pem labo-signserver:/tmp/ac-racine.pem
docker cp /tmp/chaine-signkey.pem labo-signserver:/tmp/chaine-signkey.pem
$SS keytool -importcert -alias ejbca-racine -file /tmp/ac-racine.pem -keystore $KS -storetype PKCS12 -storepass $PIN -noprompt
$SS keytool -importcert -alias signkey -file /tmp/chaine-signkey.pem -keystore $KS -storetype PKCS12 -storepass $PIN -noprompt
$SS keytool -list -v -alias signkey -keystore $KS -storetype PKCS12 -storepass $PIN | grep "chain length"   # attendu : 3

echo "== 6. Rechargement des workers SignServer =="
$SS /opt/signserver/bin/signserver reload all
$SS /opt/signserver/bin/signserver getstatus complete PDFSignerLab | grep "Subject DN"

echo "== 7. Racine hors ligne (elle ne signe plus rien) =="
$EJBCA ca deactivateca AC-Racine-Labo

cat <<'FIN'
== 8. À FAIRE À LA MAIN (paramétrage ERP, jamais dans ce script) ==
Ajouter la nouvelle racine (/tmp/racine-ejbca-seule.pem) EN TÊTE de la clé
SIG_ANCRES_CONFIANCE (Administration → Paramètres → SIGNATURE), en CONSERVANT
l'ancienne racine keytool tant que la TSA n'est pas ré-émise par EJBCA.
FIN
