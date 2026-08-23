#!/bin/bash
# Initialisation du laboratoire de signature — SANS VALEUR JURIDIQUE.
#
# Crée dans SignServer Community :
#   · un crypto-token SoftHSM2 « LaboToken » (PKCS#11 émulé — pas un HSM) ;
#   · une clé RSA 3072 et un certificat de TEST auto-émis, sujet explicite ;
#   · le worker PDFSignerLab (signature PAdES) ;
#   · le worker TimeStampLab (TSA RFC 3161 de laboratoire).
# Puis imprime le certificat à coller dans SIG_ANCRES_CONFIANCE.
#
# Idempotent : relancer ne recrée pas ce qui existe. Arrêt à la première erreur.
set -euo pipefail

C=labo-signserver
SUJET="CN=LABORATOIRE AGEROUTE - CERTIFICAT DE TEST - SANS VALEUR JURIDIQUE,O=AGEROUTE Guinee (laboratoire),C=GN"
PIN="${SOFTHSM_PIN:-labo-pin-1234}"      # PIN du jeton de TEST — pas un secret de production

cli() { docker exec "$C" /opt/keyfactor/signserver/bin/signserver "$@"; }

echo "[1/5] SignServer joignable ?"
docker exec "$C" curl -sf http://localhost:8080/signserver/healthcheck/signserverhealth | grep -q ALLOK

echo "[2/5] Crypto-token SoftHSM2 « LaboToken »"
if ! cli getstatus brief all 2>/dev/null | grep -q "LaboToken"; then
  docker exec "$C" sh -c "softhsm2-util --init-token --free --label LaboToken --pin $PIN --so-pin $PIN" >/dev/null
  cli setproperties <<EOF
WORKERGENID1.NAME=LaboToken
WORKERGENID1.TYPE=CRYPTO_WORKER
WORKERGENID1.IMPLEMENTATION_CLASS=org.signserver.server.signers.CryptoWorker
WORKERGENID1.CRYPTOTOKEN_IMPLEMENTATION_CLASS=org.signserver.server.cryptotokens.PKCS11CryptoToken
WORKERGENID1.SHAREDLIBRARYNAME=SoftHSM
WORKERGENID1.SLOTLABELTYPE=SLOT_LABEL
WORKERGENID1.SLOTLABELVALUE=LaboToken
WORKERGENID1.PIN=$PIN
WORKERGENID1.DEFAULTKEY=labokey
EOF
  cli reload all >/dev/null
fi
TOKEN_ID=$(cli getstatus brief all | awk '/LaboToken/ {gsub(/[^0-9]/,"",$0); print; exit}')

echo "[3/5] Clé de test + certificat auto-émis (sujet de laboratoire explicite)"
if ! cli getstatus complete "$TOKEN_ID" 2>/dev/null | grep -q "labokey"; then
  cli generatekey "$TOKEN_ID" -alias labokey -keyalg RSA -keyspec 3072 >/dev/null
fi
# Un certificat AUTO-ÉMIS, pour que le worker fonctionne avant l'enrôlement EJBCA.
# Il sera remplacé par un certificat de la CA de test (étape suivante).
cli generatecertreq "$TOKEN_ID" "$SUJET" "SHA256WithRSA" /tmp/labo.csr -alias labokey >/dev/null 2>&1 || true

echo "[4/5] Workers PDFSignerLab et TimeStampLab"
cli setproperties <<EOF
WORKERGENID1.NAME=PDFSignerLab
WORKERGENID1.TYPE=PROCESSABLE
WORKERGENID1.IMPLEMENTATION_CLASS=org.signserver.module.pdfsigner.PDFSigner
WORKERGENID1.CRYPTOTOKEN=LaboToken
WORKERGENID1.DEFAULTKEY=labokey
WORKERGENID1.AUTHTYPE=NOAUTH
WORKERGENID1.ADD_VISIBLE_SIGNATURE=False
WORKERGENID1.REASON=Signature de laboratoire - SANS VALEUR JURIDIQUE
WORKERGENID1.LOCATION=AGEROUTE Guinee (laboratoire)
WORKERGENID1.ALLOW_PROPERTY_OVERRIDE=REASON,LOCATION,TSA_URL
WORKERGENID1.DIGESTALGORITHM=SHA256
EOF
cli setproperties <<EOF
WORKERGENID1.NAME=TimeStampLab
WORKERGENID1.TYPE=PROCESSABLE
WORKERGENID1.IMPLEMENTATION_CLASS=org.signserver.module.tsa.TimeStampSigner
WORKERGENID1.CRYPTOTOKEN=LaboToken
WORKERGENID1.DEFAULTKEY=labokey
WORKERGENID1.AUTHTYPE=NOAUTH
WORKERGENID1.DEFAULTTSAPOLICYOID=1.3.6.1.4.1.99999.1.1
WORKERGENID1.ACCEPTANYPOLICY=true
WORKERGENID1.ACCURACYMICROS=500
EOF
cli reload all >/dev/null

echo "[5/5] État"
cli getstatus brief all | grep -E "PDFSignerLab|TimeStampLab|LaboToken" || true
echo
echo "Colle le certificat ci-dessous dans SIG_ANCRES_CONFIANCE (Paramétrage → Signature) :"
cli dumpproperties PDFSignerLab /dev/stdout 2>/dev/null | grep -i SIGNERCERT || echo "(certificat à exporter après enrôlement EJBCA — voir README, étape suivante)"
