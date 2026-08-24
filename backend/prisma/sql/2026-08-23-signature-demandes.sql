-- Demandes de signature en deux temps — exigence « SIGNATURE INTÉGRÉE AUX
-- DOCUMENTS » du 23/08/2026, §3 et §11.
--
-- Une signature n'est JAMAIS un clic : elle est préparée (PDF gelé, empreinte
-- calculée, étape vérifiée), montrée au signataire, consentie, réauthentifiée,
-- puis confirmée. La demande porte la clé d'idempotence (son id), l'empreinte
-- présentée au signataire (recomparée à la confirmation), et expire.
--
-- Additif, idempotent, camelCase quoté.

CREATE TABLE IF NOT EXISTS sig_demandes (
  id              TEXT NOT NULL,
  "decompteId"    TEXT NOT NULL,
  "cheminFichier" TEXT NOT NULL,           -- PDF GELÉ présenté au signataire
  sha256          TEXT NOT NULL,           -- empreinte montrée, recomparée avant apposition
  "signataireId"  TEXT NOT NULL,
  etape           TEXT NOT NULL,           -- nom de l'étape du circuit
  "roleEtape"     TEXT NOT NULL,
  niveau          TEXT NOT NULL,
  mode            TEXT NOT NULL,
  rang            INTEGER NOT NULL DEFAULT 1, -- 1re, 2e… signature de la chaîne
  statut          TEXT NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE | EN_COURS | SIGNEE | ANNULEE | EXPIREE
  "motifAnnulation" TEXT,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "confirmeAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sig_demandes_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "sig_demandes_decompteId_idx" ON sig_demandes ("decompteId");
CREATE INDEX IF NOT EXISTS "sig_demandes_signataireId_idx" ON sig_demandes ("signataireId");

-- Chaîne incrémentale : le document signé devient la base de la signature
-- suivante. `rang` ordonne la chaîne ; `sha256Source` du rang n+1 = `sha256Signe`
-- du rang n (vérifié par le code).
ALTER TABLE sig_documents_finalises ADD COLUMN IF NOT EXISTS rang INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sig_documents_finalises ADD COLUMN IF NOT EXISTS etape TEXT;
ALTER TABLE sig_documents_finalises ADD COLUMN IF NOT EXISTS "demandeId" TEXT;

-- §4 : mention de laboratoire exigée par le mandat, mot pour mot.
UPDATE parametres_metier
   SET valeur = 'SIMULATION — CERTIFICAT DE TEST — SANS VALEUR JURIDIQUE'
 WHERE cle = 'SIG_FILIGRANE_TEXTE'
   AND valeur = 'SIMULATION — SANS VALEUR JURIDIQUE';
