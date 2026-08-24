#!/bin/bash
# Initialisation du laboratoire de signature — SANS VALEUR JURIDIQUE.
#
# L'image SignServer CE 7.3.2 n'embarque ni SoftHSM2 ni openssl : le jeton de
# laboratoire est un KeystoreCryptoToken (PKCS#12) qui vit dans le volume
# persistant du conteneur — les clés ne quittent JAMAIS SignServer, l'ERP ne
# les voit pas. L'AC racine de test est créée au keytool ; l'enrôlement EJBCA
# (racine → intermédiaire → worker, CRL, OCSP) est l'étape suivante.
#
# Idempotent. Arrêt à la première erreur.
set -euo pipefail

C=labo-signserver
SS=/opt/keyfactor/signserver
P=/mnt/persistent
PIN="${LABO_PIN:-labo-pin-de-test-1234}"   # PIN de TEST — pas un secret de production
DN_CA="CN=LABORATOIRE AGEROUTE - AC RACINE DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"
DN_SIGN="CN=LABORATOIRE AGEROUTE - SIGNATURE PDF DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"
DN_TSA="CN=LABORATOIRE AGEROUTE - HORODATAGE DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"

x() { docker exec "$C" bash -c "$1"; }

echo "[1/6] SignServer joignable"
x "curl -sf http://localhost:8080/signserver/healthcheck/signserverhealth" | grep -q ALLOK

echo "[2/6] AC racine de laboratoire (keytool, PKCS#12)"
x "[ -f $P/labo-ca.p12 ] || keytool -genkeypair -alias laborootca -keyalg RSA -keysize 3072 -validity 3650 \
   -dname '$DN_CA' -ext bc:c=ca:true -ext ku:c=keyCertSign,cRLSign \
   -keystore $P/labo-ca.p12 -storetype PKCS12 -storepass '$PIN'"
x "keytool -exportcert -alias laborootca -keystore $P/labo-ca.p12 -storepass '$PIN' -rfc -file $P/labo-ca.pem"

echo "[3/6] Clé de signature PDF + certificat émis par l'AC de test"
x "[ -f $P/labo-keys.p12 ] || keytool -genkeypair -alias signkey -keyalg RSA -keysize 3072 -validity 1095 \
   -dname '$DN_SIGN' -keystore $P/labo-keys.p12 -storetype PKCS12 -storepass '$PIN'"
x "keytool -certreq -alias signkey -keystore $P/labo-keys.p12 -storepass '$PIN' -file /tmp/sign.csr"
x "keytool -gencert -alias laborootca -keystore $P/labo-ca.p12 -storepass '$PIN' \
   -ext ku:c=digitalSignature -validity 1095 -rfc -infile /tmp/sign.csr -outfile /tmp/sign.pem"
x "keytool -importcert -alias laborootca -keystore $P/labo-keys.p12 -storepass '$PIN' -noprompt -file $P/labo-ca.pem 2>/dev/null || true"
x "keytool -importcert -alias signkey    -keystore $P/labo-keys.p12 -storepass '$PIN' -noprompt -file /tmp/sign.pem"

echo "[4/6] Clé d'horodatage + certificat (extension timeStamping critique — exigée par la RFC 3161)"
x "keytool -list -keystore $P/labo-keys.p12 -storepass '$PIN' -alias tsakey >/dev/null 2>&1 || keytool -genkeypair -alias tsakey -keyalg RSA -keysize 3072 -validity 1095 \
   -dname '$DN_TSA' -keystore $P/labo-keys.p12 -storetype PKCS12 -storepass '$PIN'"
x "keytool -certreq -alias tsakey -keystore $P/labo-keys.p12 -storepass '$PIN' -file /tmp/tsa.csr"
x "keytool -gencert -alias laborootca -keystore $P/labo-ca.p12 -storepass '$PIN' \
   -ext ku:c=digitalSignature -ext eku:c=timeStamping -validity 1095 -rfc -infile /tmp/tsa.csr -outfile /tmp/tsa.pem"
x "keytool -importcert -alias tsakey -keystore $P/labo-keys.p12 -storepass '$PIN' -noprompt -file /tmp/tsa.pem"

echo "[5/6] Workers : jeton, PDFSignerLab, TimeStampLab"
x "cat > /tmp/workers.properties <<EOF
WORKERGENID1.NAME=LaboToken
WORKERGENID1.TYPE=CRYPTO_WORKER
WORKERGENID1.IMPLEMENTATION_CLASS=org.signserver.server.signers.CryptoWorker
WORKERGENID1.CRYPTOTOKEN_IMPLEMENTATION_CLASS=org.signserver.server.cryptotokens.KeystoreCryptoToken
WORKERGENID1.KEYSTOREPATH=$P/labo-keys.p12
WORKERGENID1.KEYSTORETYPE=PKCS12
WORKERGENID1.KEYSTOREPASSWORD=$PIN
WORKERGENID1.DEFAULTKEY=signkey

WORKERGENID2.NAME=PDFSignerLab
WORKERGENID2.TYPE=PROCESSABLE
WORKERGENID2.IMPLEMENTATION_CLASS=org.signserver.module.pdfsigner.PDFSigner
WORKERGENID2.CRYPTOTOKEN=LaboToken
WORKERGENID2.DEFAULTKEY=signkey
WORKERGENID2.AUTHTYPE=NOAUTH
WORKERGENID2.DISABLEKEYUSAGECOUNTER=true
WORKERGENID2.DIGESTALGORITHM=SHA256
WORKERGENID2.REASON=Signature de laboratoire - SANS VALEUR JURIDIQUE
WORKERGENID2.LOCATION=AGEROUTE Guinee (laboratoire)
WORKERGENID2.ALLOW_PROPERTY_OVERRIDE=REASON,LOCATION,TSA_URL

WORKERGENID3.NAME=TimeStampLab
WORKERGENID3.TYPE=PROCESSABLE
WORKERGENID3.IMPLEMENTATION_CLASS=org.signserver.module.tsa.TimeStampSigner
WORKERGENID3.CRYPTOTOKEN=LaboToken
WORKERGENID3.DEFAULTKEY=tsakey
WORKERGENID3.AUTHTYPE=NOAUTH
WORKERGENID3.DISABLEKEYUSAGECOUNTER=true
WORKERGENID3.DEFAULTTSAPOLICYOID=1.3.6.1.4.1.4711.42.1
WORKERGENID3.ACCEPTANYPOLICY=true
EOF
$SS/bin/signserver setproperties /tmp/workers.properties >/dev/null
$SS/bin/signserver reload all >/dev/null"

echo "[6/6] État des workers"
x "$SS/bin/signserver getstatus brief all" | grep -E "LaboToken|PDFSignerLab|TimeStampLab|Status" | head -12
echo
echo "── ANCRE DE CONFIANCE (à coller dans Paramétrage → Signature → SIG_ANCRES_CONFIANCE) ──"
x "cat $P/labo-ca.pem"
