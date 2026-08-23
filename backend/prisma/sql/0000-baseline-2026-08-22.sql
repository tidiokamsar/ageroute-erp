-- BASELINE du schéma PostgreSQL — pg_dump --schema-only de la production le 22/08/2026,
-- après application des 11 migrations additives (dont CONFIRM_BCRG).
-- Contient TOUT : tables Prisma ET tables hors schéma (bpmn_*, ref_*, sig_*),
-- types énumérés, index, contraintes.
--
-- Sert à reconstruire une base VIERGE :
--   psql -v ON_ERROR_STOP=1 -f 0000-baseline-2026-08-22.sql
--   puis les fichiers datés, dans l'ordre (tous idempotents : les rejouer est sans effet).
-- Preuve faite le 22/08/2026 sur un conteneur vierge : 76 tables, 11 migrations OK.
--
-- Ne JAMAIS l'appliquer sur une base existante : il recréerait les objets.
-- Constat « reconstruction non démontrée » de la revue du 22/08/2026.

--
-- PostgreSQL database dump
--

\restrict diLQj3rqBM7NsgxyA5qDTBacfqiARJTspnLHpAdlZsrJj3aidHEWTlBgJmfzgOp

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AuditAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditAction" AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'APPROVE',
    'REJECT',
    'SIGN',
    'LOGIN',
    'LOGIN_FAILED',
    'CONFIRM_BCRG'
);


--
-- Name: ProcedurePassation; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProcedurePassation" AS ENUM (
    'APPEL_OFFRES_OUVERT',
    'APPEL_OFFRES_RESTREINT',
    'GRES_A_GRES',
    'CONSULTATION'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'DG',
    'DAF',
    'DMC',
    'UGP',
    'MISSION',
    'TECHNIQUE',
    'ENTREPRISE',
    'AUDITEUR',
    'BAILLEUR',
    'BUDGET',
    'TRESOR',
    'FER_AGT',
    'BCRG',
    'DSF'
);


--
-- Name: StatutAttachement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutAttachement" AS ENUM (
    'BROUILLON',
    'SOUMIS',
    'EN_CONTROLE_MISSION',
    'EN_CONTROLE_TECHNIQUE',
    'DEMANDE_CORRECTION',
    'VALIDE',
    'REJETE'
);


--
-- Name: StatutDecompte; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutDecompte" AS ENUM (
    'BROUILLON',
    'DEPOSE',
    'EN_CONTROLE',
    'EN_CORRECTION',
    'EN_VALIDATION',
    'VALIDE_DG',
    'EN_CIRCUIT_FINANCIER',
    'ORDONNANCE',
    'VALIDE',
    'REJETE',
    'PAYE',
    'SOUMIS',
    'VISA_DAF',
    'VISA_DG'
);


--
-- Name: StatutEntreprise; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutEntreprise" AS ENUM (
    'CONFORME',
    'A_REGULARISER',
    'BLOQUE',
    'EN_ATTENTE',
    'AUTORISE',
    'ALERTE',
    'SUSPENDU',
    'ARCHIVE'
);


--
-- Name: StatutMarche; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutMarche" AS ENUM (
    'EN_PREPARATION',
    'ACTIF',
    'SUSPENDU',
    'RESILIE',
    'SOLDE',
    'CLOTURE',
    'BROUILLON',
    'SIGNE',
    'NOTIFIE',
    'EN_EXECUTION',
    'EN_AVENANT',
    'EN_RECEPTION_PROVISOIRE',
    'EN_RECEPTION_DEFINITIVE'
);


--
-- Name: StatutProjet; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutProjet" AS ENUM (
    'PREPARATION',
    'EN_VALIDATION',
    'APPROUVE',
    'EN_EXECUTION',
    'SUSPENDU',
    'EN_RETARD',
    'EN_AVENANT',
    'RECEPTION_PARTIELLE',
    'RECEPTION_DEFINITIVE',
    'CLOS',
    'ANNULE'
);


--
-- Name: StatutWorkflow; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StatutWorkflow" AS ENUM (
    'EN_ATTENTE',
    'EN_COURS',
    'APPROUVE',
    'REJETE',
    'EXPIRE'
);


--
-- Name: TypeAttachement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeAttachement" AS ENUM (
    'MENSUEL',
    'PARTIEL',
    'FINAL',
    'AVENANT',
    'RECEPTION'
);


--
-- Name: TypeDecompte; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeDecompte" AS ENUM (
    'AVANCE',
    'PROVISOIRE',
    'PARTIEL',
    'INTERMEDIAIRE',
    'FINAL',
    'CLOTURE',
    'APRES_AVENANT'
);


--
-- Name: TypeDocument; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeDocument" AS ENUM (
    'REGISTRE_COMMERCE',
    'STATUTS_SOCIETE',
    'NIF_DOCUMENT',
    'TVA_DOCUMENT',
    'ATTESTATION_FISCALE',
    'ATTESTATION_SOCIALE',
    'PIECE_REPRESENTANT',
    'AGREMENT_TECHNIQUE',
    'AUTORISATION_SPECIFIQUE',
    'RELEVE_BANCAIRE',
    'BILAN_COMPTABLE',
    'AUTRE'
);


--
-- Name: TypeFinancement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeFinancement" AS ENUM (
    'BANQUE_MONDIALE',
    'BAD',
    'BUDGET_NATIONAL',
    'FER',
    'BOAD',
    'BID',
    'UE',
    'AUTRE',
    'BADEA',
    'AFD',
    'KFW'
);


--
-- Name: TypeMarche; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeMarche" AS ENUM (
    'TRAVAUX',
    'SERVICES',
    'FOURNITURES',
    'ETUDES'
);


--
-- Name: TypeProjet; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TypeProjet" AS ENUM (
    'TRAVAUX_ROUTIERS',
    'PONT_OUVRAGE_ART',
    'PISTE_RURALE',
    'BITUMAGE',
    'REHABILITATION',
    'ENTRETIEN_COURANT',
    'ENTRETIEN_PERIODIQUE',
    'ETUDE_TECHNIQUE',
    'SUPERVISION',
    'AUTRE'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alertes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertes (
    id text NOT NULL,
    type text NOT NULL,
    "entiteType" text NOT NULL,
    "entiteId" text NOT NULL,
    titre text NOT NULL,
    message text NOT NULL,
    destinataires text[],
    canal text DEFAULT 'EMAIL'::text NOT NULL,
    envoye boolean DEFAULT false NOT NULL,
    lu boolean DEFAULT false NOT NULL,
    "userId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: alertes_entreprises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertes_entreprises (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    type text NOT NULL,
    niveau text DEFAULT 'AVERTISSEMENT'::text NOT NULL,
    message text NOT NULL,
    echeance timestamp(3) without time zone,
    acquittee boolean DEFAULT false NOT NULL,
    "acquitteeAt" timestamp(3) without time zone,
    "acquitteeBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachement_commentaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_commentaires (
    id text NOT NULL,
    "attachementId" text NOT NULL,
    contenu text NOT NULL,
    "auteurId" text NOT NULL,
    "auteurNom" text,
    "auteurRole" text,
    type text DEFAULT 'COMMENTAIRE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachement_gps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_gps (
    id text NOT NULL,
    "attachementId" text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    altitude double precision,
    "precision" double precision,
    description text,
    "capturePar" text,
    "captureAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachement_lignes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_lignes (
    id text NOT NULL,
    "attachementId" text NOT NULL,
    "codeArticle" text NOT NULL,
    designation text NOT NULL,
    unite text NOT NULL,
    "quantiteContrat" double precision NOT NULL,
    "quantitePrecedent" double precision DEFAULT 0 NOT NULL,
    "quantiteCourante" double precision DEFAULT 0 NOT NULL,
    "quantiteCumulee" double precision DEFAULT 0 NOT NULL,
    "prixUnitaire" bigint NOT NULL,
    montant bigint DEFAULT 0 NOT NULL,
    statut text DEFAULT 'OK'::text NOT NULL,
    depassement boolean DEFAULT false NOT NULL,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: attachement_medias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_medias (
    id text NOT NULL,
    "attachementId" text NOT NULL,
    type text NOT NULL,
    "cheminFichier" text NOT NULL,
    "urlPublique" text,
    legende text,
    "latGps" double precision,
    "lonGps" double precision,
    "prisAt" timestamp(3) without time zone,
    "prisPar" text,
    "tailleOctets" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachement_mesures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_mesures (
    id text NOT NULL,
    "ligneId" text NOT NULL,
    methode text NOT NULL,
    valeur double precision NOT NULL,
    unite text NOT NULL,
    "sourcePreuve" text NOT NULL,
    "niveauConfiance" integer DEFAULT 3 NOT NULL,
    "mesurePar" text NOT NULL,
    "mesureAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachement_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachement_validations (
    id text NOT NULL,
    "attachementId" text NOT NULL,
    etape text NOT NULL,
    statut text NOT NULL,
    commentaire text NOT NULL,
    "validePar" text NOT NULL,
    "valideNom" text,
    "valideAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: attachements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachements (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    ouvrage text,
    section text,
    "pkDebut" double precision,
    "pkFin" double precision,
    "natureTravaux" text NOT NULL,
    unite text NOT NULL,
    "quantitePrevue" double precision NOT NULL,
    "quantiteExecutee" double precision NOT NULL,
    "prixUnitaireGnf" bigint NOT NULL,
    "montantHtGnf" bigint DEFAULT 0 NOT NULL,
    "latGps" double precision,
    "lonGps" double precision,
    photos text[] DEFAULT ARRAY[]::text[],
    observations text,
    valide boolean DEFAULT false NOT NULL,
    "motifRejet" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "bpuArticleId" text,
    "commentaireTechnique" text,
    "cumulExecuteAvant" double precision DEFAULT 0 NOT NULL,
    "valideParMission" boolean DEFAULT false NOT NULL,
    "valideParTechnique" boolean DEFAULT false NOT NULL,
    code text,
    "createdById" text,
    "periodeDebut" timestamp(3) without time zone,
    "periodeFin" timestamp(3) without time zone,
    "soumisAt" timestamp(3) without time zone,
    statut public."StatutAttachement" DEFAULT 'BROUILLON'::public."StatutAttachement" NOT NULL,
    "typeAttachement" public."TypeAttachement" DEFAULT 'MENSUEL'::public."TypeAttachement" NOT NULL,
    "valideAt" timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL,
    "montantArmpGnf" bigint DEFAULT 0 NOT NULL,
    "montantTtcGnf" bigint DEFAULT 0 NOT NULL,
    "montantTvaGnf" bigint DEFAULT 0 NOT NULL,
    "projetId" text
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "userId" text,
    action public."AuditAction" NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    before jsonb,
    after jsonb,
    "ipAddress" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: avenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avenants (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    numero integer NOT NULL,
    objet text NOT NULL,
    "montantSupplementaireGnf" bigint DEFAULT 0 NOT NULL,
    "prolongationJours" integer DEFAULT 0 NOT NULL,
    "dateSignature" timestamp(3) without time zone,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    statut text DEFAULT 'EN_COURS'::text NOT NULL,
    "impactPerimetre" text,
    motif text,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "valideFinancierAt" timestamp(3) without time zone,
    "valideFinancierPar" text,
    "valideTechniqueAt" timestamp(3) without time zone,
    "valideTechniquePar" text,
    "visaDgAt" timestamp(3) without time zone,
    "visaDgPar" text,
    "approbationArmpRef" text
);


--
-- Name: bpmn_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpmn_actions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    instance_id text NOT NULL,
    step_id text NOT NULL,
    decideur_id text NOT NULL,
    decision text NOT NULL,
    commentaire text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bpmn_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpmn_definitions (
    id text NOT NULL,
    module_type text NOT NULL,
    nom text NOT NULL,
    description text,
    version integer DEFAULT 1,
    actif boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bpmn_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpmn_instances (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    definition_id text NOT NULL,
    module_type text NOT NULL,
    entity_id text NOT NULL,
    statut text DEFAULT 'EN_COURS'::text,
    etape_actuelle integer DEFAULT 0,
    soumetteur_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bpmn_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpmn_steps (
    id text NOT NULL,
    definition_id text NOT NULL,
    ordre integer NOT NULL,
    nom text NOT NULL,
    description text,
    type text DEFAULT 'USER_TASK'::text,
    role_requis text,
    sla_jours integer DEFAULT 5,
    is_system boolean DEFAULT false,
    actions_permises text[] DEFAULT '{APPROUVE,REJETE,DEMANDE_CORRECTION,DEMANDE_COMPLEMENT,SUSPENDRE,AUDIT}'::text[]
);


--
-- Name: bpu_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpu_articles (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    "lotId" text,
    code text NOT NULL,
    designation text NOT NULL,
    unite text NOT NULL,
    "quantitePrevue" double precision NOT NULL,
    "prixUnitaireGnf" bigint NOT NULL,
    "montantGnf" bigint NOT NULL,
    ordre integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: circuit_financier_etapes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circuit_financier_etapes (
    id text NOT NULL,
    "circuitId" text NOT NULL,
    ordre integer NOT NULL,
    nom text NOT NULL,
    "roleOuService" text NOT NULL,
    "dateTransmission" timestamp(3) without time zone,
    "dateReception" timestamp(3) without time zone,
    "dateVisa" timestamp(3) without time zone,
    commentaire text,
    statut text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    "validePar" text,
    "valideAt" timestamp(3) without time zone
);


--
-- Name: circuits_financiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circuits_financiers (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    type text NOT NULL,
    "bailleurNom" text,
    "etapeActuelle" integer DEFAULT 0 NOT NULL,
    statut text DEFAULT 'EN_COURS'::text NOT NULL,
    "dateCreation" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: company_markets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_markets (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    "marcheId" text NOT NULL,
    "roleParticipation" text DEFAULT 'TITULAIRE'::text NOT NULL,
    "montantAttribue" bigint,
    "partPourcentage" double precision,
    statut text DEFAULT 'ACTIF'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: company_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_status_history (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    "ancienStatut" text NOT NULL,
    "nouveauStatut" text NOT NULL,
    "changedBy" text NOT NULL,
    commentaire text,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: company_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_users (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    "userId" text NOT NULL,
    "roleType" text DEFAULT 'LECTEUR'::text NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "canSubmitDocuments" boolean DEFAULT false NOT NULL,
    "canViewContracts" boolean DEFAULT true NOT NULL,
    "canViewDecomptes" boolean DEFAULT true NOT NULL,
    "canDeposerDecompte" boolean DEFAULT false NOT NULL,
    statut text DEFAULT 'ACTIF'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: conformite_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conformite_verifications (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    "scoreAvant" integer NOT NULL,
    "scoreApres" integer NOT NULL,
    "statutAvant" text NOT NULL,
    "statutApres" text NOT NULL,
    detail jsonb,
    auteur text,
    commentaire text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "declencheurType" text
);


--
-- Name: contacts_entreprises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts_entreprises (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    nom text NOT NULL,
    prenom text,
    fonction text,
    telephone text,
    email text,
    principal boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: decompte_commentaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decompte_commentaires (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    contenu text NOT NULL,
    "auteurId" text NOT NULL,
    "auteurNom" text,
    "auteurRole" text,
    type text DEFAULT 'COMMENTAIRE'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: decompte_lignes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decompte_lignes (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    "codeArticle" text NOT NULL,
    designation text NOT NULL,
    unite text NOT NULL,
    "quantiteContrat" double precision NOT NULL,
    "quantitePrecedent" double precision DEFAULT 0 NOT NULL,
    "quantiteCourante" double precision DEFAULT 0 NOT NULL,
    "quantiteCumulee" double precision DEFAULT 0 NOT NULL,
    "prixUnitaire" bigint NOT NULL,
    "montantBrut" bigint DEFAULT 0 NOT NULL,
    "tauxTva" double precision DEFAULT 18 NOT NULL,
    "montantTva" bigint DEFAULT 0 NOT NULL,
    "tauxRetenue" double precision DEFAULT 5 NOT NULL,
    "montantRetenue" bigint DEFAULT 0 NOT NULL,
    "tauxAvance" double precision DEFAULT 0 NOT NULL,
    "montantAvanceRecup" bigint DEFAULT 0 NOT NULL,
    "montantPenalite" bigint DEFAULT 0 NOT NULL,
    "motifPenalite" text,
    "montantNet" bigint DEFAULT 0 NOT NULL,
    statut text DEFAULT 'OK'::text NOT NULL,
    depassement boolean DEFAULT false NOT NULL,
    "attachementLigneId" text,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "montantArmp" bigint DEFAULT 0 NOT NULL,
    "montantTtc" bigint DEFAULT 0 NOT NULL,
    "precompteTva" bigint DEFAULT 0 NOT NULL,
    "tauxArmp" double precision DEFAULT 0.6 NOT NULL
);


--
-- Name: decompte_payment_traces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decompte_payment_traces (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    etape text NOT NULL,
    statut text NOT NULL,
    reference text,
    "montantGnf" bigint,
    "dateTransmission" timestamp(3) without time zone,
    "dateValidation" timestamp(3) without time zone,
    "operateurNom" text,
    "banqueReference" text,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: decompte_validations_avancees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decompte_validations_avancees (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    etape text NOT NULL,
    decision text NOT NULL,
    commentaire text NOT NULL,
    "validePar" text NOT NULL,
    "valideNom" text,
    "valideRole" text,
    "signatureRef" text,
    "valideAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: decomptes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decomptes (
    id text NOT NULL,
    reference text NOT NULL,
    type public."TypeDecompte" NOT NULL,
    statut public."StatutDecompte" DEFAULT 'BROUILLON'::public."StatutDecompte" NOT NULL,
    "marcheId" text NOT NULL,
    "lotId" text,
    "entrepriseId" text NOT NULL,
    "periodeDebut" timestamp(3) without time zone,
    "periodeFin" timestamp(3) without time zone,
    "montantPeriodeHtGnf" bigint DEFAULT 0 NOT NULL,
    "cumulPrecedentHtGnf" bigint DEFAULT 0 NOT NULL,
    "cumulActuelHtGnf" bigint DEFAULT 0 NOT NULL,
    tva bigint DEFAULT 0 NOT NULL,
    "retenueGarantie" bigint DEFAULT 0 NOT NULL,
    "avanceRecuperee" bigint DEFAULT 0 NOT NULL,
    penalites bigint DEFAULT 0 NOT NULL,
    "revisionPrix" bigint DEFAULT 0 NOT NULL,
    "netAPayer" bigint DEFAULT 0 NOT NULL,
    "tokenSignature" text,
    "empreinteNumerique" text,
    "dateSignature" timestamp(3) without time zone,
    signataire text,
    "dateDepot" timestamp(3) without time zone,
    "datePaiement" timestamp(3) without time zone,
    observations text,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "analyseDmc" text,
    "auditRequis" boolean DEFAULT false NOT NULL,
    "commentaireFinancier" text,
    "controleAutoResultats" jsonb,
    "numeroDossier" text,
    "piecesObligatoires" jsonb,
    "traitementSuspendu" boolean DEFAULT false NOT NULL,
    "visaFinancier" text,
    "ligneBudgetaireCode" text,
    "observationsDg" text,
    "observationsTechniques" jsonb,
    "montantArmpGnf" bigint DEFAULT 0 NOT NULL,
    "montantTtcGnf" bigint DEFAULT 0 NOT NULL,
    "precompteTvaGnf" bigint DEFAULT 0 NOT NULL,
    "projetId" text,
    "reglesSnapshot" jsonb
);


--
-- Name: COLUMN decomptes."reglesSnapshot"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.decomptes."reglesSnapshot" IS 'L1.2 — règles effectives (A1-A7) figées au dernier calcul : { regles, methode: GLOBAL|LIGNES, dateCalcul }. Rejouabilité auditoire.';


--
-- Name: delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delegations (
    id text NOT NULL,
    "titulaireId" text NOT NULL,
    "suppleantId" text NOT NULL,
    "dateDebut" timestamp(3) without time zone NOT NULL,
    "dateFin" timestamp(3) without time zone NOT NULL,
    motif text,
    actif boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    type text NOT NULL,
    nom text NOT NULL,
    description text,
    "cheminFichier" text NOT NULL,
    "mimeType" text,
    "tailleOctets" integer,
    version integer DEFAULT 1 NOT NULL,
    "estArchive" boolean DEFAULT false NOT NULL,
    "uploadePar" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "statutValidation" text DEFAULT 'DEPOSE'::text NOT NULL,
    "valideParId" text,
    "valideAt" timestamp(3) without time zone,
    "motifRetour" text,
    CONSTRAINT documents_statut_validation_ck CHECK (("statutValidation" = ANY (ARRAY['DEPOSE'::text, 'VALIDE'::text, 'RETOURNE'::text])))
);


--
-- Name: COLUMN documents."statutValidation"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents."statutValidation" IS 'DEPOSE (par l''entreprise) | VALIDE (Mission/Technique) | RETOURNE (à corriger)';


--
-- Name: COLUMN documents."motifRetour"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents."motifRetour" IS 'Motif obligatoire lorsqu''une pièce est retournée à l''entreprise';


--
-- Name: documents_entreprises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents_entreprises (
    id text NOT NULL,
    "entrepriseId" text NOT NULL,
    type public."TypeDocument" NOT NULL,
    libelle text,
    numero text,
    url text,
    "dateEmission" timestamp(3) without time zone,
    "dateExpiration" timestamp(3) without time zone,
    valide boolean DEFAULT false NOT NULL,
    "verifieAt" timestamp(3) without time zone,
    "verifieBy" text,
    observations text,
    actif boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: entreprises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entreprises (
    id text NOT NULL,
    "raisonSociale" text NOT NULL,
    nif text NOT NULL,
    numerotva text,
    rccm text,
    adresse text,
    telephone text,
    email text,
    "siteWeb" text,
    dirigeant text,
    agrement text,
    classement text,
    statut public."StatutEntreprise" DEFAULT 'A_REGULARISER'::public."StatutEntreprise" NOT NULL,
    "scoreConformite" integer DEFAULT 0 NOT NULL,
    "motifBlocage" text,
    "regulariteFiscale" boolean DEFAULT false NOT NULL,
    "regulariteSociale" boolean DEFAULT false NOT NULL,
    "attestationValide" boolean DEFAULT false NOT NULL,
    "cautionBancaire" boolean DEFAULT false NOT NULL,
    "dateVerification" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "assujettTVA" boolean DEFAULT false NOT NULL,
    "attestationFiscaleExpire" timestamp(3) without time zone,
    "attestationSocialeExpire" timestamp(3) without time zone,
    "autoriseContracterEtat" boolean DEFAULT true NOT NULL,
    "estRadie" boolean DEFAULT false NOT NULL,
    "regimeFiscal" text,
    "attestationFiscaleDoc" text,
    "attestationFiscaleNum" text,
    "attestationSocialeDoc" text,
    "attestationSocialeNum" text,
    "categorieAgrement" text,
    "codeBanque" text,
    commune text,
    "dateCreation" timestamp(3) without time zone,
    "dateProchainVerif" timestamp(3) without time zone,
    "dateRadiation" timestamp(3) without time zone,
    "domainesCompetence" text[],
    "estInterditSoumission" boolean DEFAULT false NOT NULL,
    "estSuspendu" boolean DEFAULT false NOT NULL,
    "formeJuridique" text,
    iban text,
    "motivRadiation" text,
    "nomBanque" text,
    "qualiteRepresentant" text,
    "representantLegal" text,
    sigle text,
    ville text,
    "niveauRisque" text DEFAULT 'FAIBLE'::text NOT NULL
);


--
-- Name: formules_revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formules_revision (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    "coeffFixe" double precision DEFAULT 0.15 NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: funding_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_allocations (
    id text NOT NULL,
    "fundingEnvelopeId" text NOT NULL,
    "projetId" text,
    "marcheId" text,
    "decompteId" text,
    "allocationAmount" bigint NOT NULL,
    "committedAmount" bigint DEFAULT 0 NOT NULL,
    "consumedAmount" bigint DEFAULT 0 NOT NULL,
    "allocationReason" text,
    statut text DEFAULT 'draft'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: funding_consumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_consumptions (
    id text NOT NULL,
    "fundingAllocationId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    montant bigint NOT NULL,
    "consumptionType" text NOT NULL,
    "consumedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: funding_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_documents (
    id text NOT NULL,
    "fundingSourceId" text NOT NULL,
    "documentType" text NOT NULL,
    "documentNumber" text,
    "fileId" text,
    "cheminFichier" text,
    "issueDate" timestamp(3) without time zone,
    "expiryDate" timestamp(3) without time zone,
    "validationStatus" text DEFAULT 'pending'::text NOT NULL,
    "verifiedBy" text,
    "verifiedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: funding_envelopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_envelopes (
    id text NOT NULL,
    "fundingSourceId" text NOT NULL,
    "envelopeCode" text NOT NULL,
    label text NOT NULL,
    "totalAmount" bigint DEFAULT 0 NOT NULL,
    "allocatedAmount" bigint DEFAULT 0 NOT NULL,
    "consumedAmount" bigint DEFAULT 0 NOT NULL,
    "availableAmount" bigint DEFAULT 0 NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    statut text DEFAULT 'draft'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: funding_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_sources (
    id text NOT NULL,
    "sourceCode" text NOT NULL,
    "sourceType" text NOT NULL,
    nom text NOT NULL,
    "donorName" text,
    "currencyCode" text DEFAULT 'GNF'::text NOT NULL,
    statut text DEFAULT 'draft'::text NOT NULL,
    "createdBy" text NOT NULL,
    "updatedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: funding_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_status_history (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "oldStatus" text NOT NULL,
    "newStatus" text NOT NULL,
    "changedBy" text NOT NULL,
    commentaire text,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: garanties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garanties (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    type text NOT NULL,
    "montantGnf" bigint NOT NULL,
    "dateExpiration" timestamp(3) without time zone,
    banque text,
    reference text,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "appelGarantie" boolean DEFAULT false NOT NULL,
    "dateAppel" timestamp(3) without time zone,
    "dateEmission" timestamp(3) without time zone,
    observations text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: historique_statuts_marche; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historique_statuts_marche (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    "statutAvant" public."StatutMarche",
    "statutApres" public."StatutMarche" NOT NULL,
    motif text,
    "pieceRef" text,
    "userId" text,
    "userEmail" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: index_mensuels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.index_mensuels (
    id text NOT NULL,
    code text NOT NULL,
    libelle text NOT NULL,
    annee integer NOT NULL,
    mois integer NOT NULL,
    valeur double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lignes_budgetaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lignes_budgetaires (
    id text NOT NULL,
    code text NOT NULL,
    libelle text NOT NULL,
    exercice integer NOT NULL,
    "montantDoteGnf" bigint DEFAULT 0 NOT NULL,
    "montantEngageGnf" bigint DEFAULT 0 NOT NULL,
    "montantPayeGnf" bigint DEFAULT 0 NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lots (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    numero text NOT NULL,
    designation text NOT NULL,
    "montantGnf" bigint NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: marche_affectations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marche_affectations (
    id text NOT NULL,
    "userId" text NOT NULL,
    "marcheId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: marches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marches (
    id text NOT NULL,
    reference text NOT NULL,
    intitule text NOT NULL,
    objet text,
    type public."TypeMarche" NOT NULL,
    procedure public."ProcedurePassation" NOT NULL,
    statut public."StatutMarche" DEFAULT 'BROUILLON'::public."StatutMarche" NOT NULL,
    financement public."TypeFinancement" NOT NULL,
    "entrepriseId" text NOT NULL,
    "coTraitants" text,
    "tronconCode" text,
    "regionNom" text,
    "pkDebut" double precision,
    "pkFin" double precision,
    "montantInitialGnf" bigint NOT NULL,
    "montantActualiseGnf" bigint,
    "tauxTva" double precision DEFAULT 18 NOT NULL,
    "tauxRetenueGarantie" double precision DEFAULT 5 NOT NULL,
    "tauxAvance" double precision DEFAULT 20 NOT NULL,
    "dateOs" timestamp(3) without time zone,
    "dateDebutPrevue" timestamp(3) without time zone,
    "dateFinPrevue" timestamp(3) without time zone,
    "dateFinReelle" timestamp(3) without time zone,
    "delaiMois" integer,
    "numContrat" text,
    bailleur text,
    observations text,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "directionTechnique" text,
    "missionControle" text,
    "ligneBudgetaireId" text,
    "projetId" text,
    "avanceComplementaireGnf" bigint DEFAULT 0 NOT NULL,
    commune text,
    composante text,
    "createdBy" text,
    "dateNotification" timestamp(3) without time zone,
    "dateReceptionDefinitive" timestamp(3) without time zone,
    "dateReceptionProvisoire" timestamp(3) without time zone,
    "dateSignature" timestamp(3) without time zone,
    "delaiJours" integer,
    "formulaRevisionPrix" text,
    "montantAvanceGnf" bigint DEFAULT 0 NOT NULL,
    "numApprobation" text,
    "penalitesJourGnf" bigint DEFAULT 0 NOT NULL,
    "plafondPenalitesPct" double precision DEFAULT 10 NOT NULL,
    prefecture text,
    "pretAExecuter" boolean DEFAULT false NOT NULL,
    "sousTraitants" text,
    "statutCloture" text DEFAULT 'OUVERT'::text NOT NULL,
    "statutPaiement" text DEFAULT 'NON_SOLDE'::text NOT NULL,
    "statutReception" text DEFAULT 'AUCUNE'::text NOT NULL,
    "updatedBy" text
);


--
-- Name: ordres_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordres_service (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    numero integer NOT NULL,
    type text NOT NULL,
    objet text NOT NULL,
    "dateEmission" timestamp(3) without time zone NOT NULL,
    "dateEffet" timestamp(3) without time zone,
    "impactDelaiJours" integer DEFAULT 0 NOT NULL,
    "impactMontantGnf" bigint DEFAULT 0 NOT NULL,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: paiements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paiements (
    id text NOT NULL,
    "decompteId" text NOT NULL,
    "montantGnf" bigint NOT NULL,
    "dateOrdre" timestamp(3) without time zone,
    "dateExecution" timestamp(3) without time zone,
    reference text,
    banque text,
    observations text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "refBcrg" text,
    "refDntcp" text,
    "typeCircuit" text,
    statut text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "montantReelGnf" bigint,
    "dateReelleTransfert" timestamp(3) without time zone,
    "confirmePar" text,
    "confirmeAt" timestamp(3) without time zone
);


--
-- Name: COLUMN paiements."montantReelGnf"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paiements."montantReelGnf" IS 'F10 — montant réel transféré par la BCRG (peut différer du montant ordonnancé)';


--
-- Name: COLUMN paiements."dateReelleTransfert"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paiements."dateReelleTransfert" IS 'F10 — date réelle du virement bancaire (confirmée par la BCRG)';


--
-- Name: COLUMN paiements."confirmePar"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paiements."confirmePar" IS 'F10 — email de l''agent BCRG qui confirme le virement';


--
-- Name: COLUMN paiements."confirmeAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.paiements."confirmeAt" IS 'F10 — horodatage de la confirmation bancaire';


--
-- Name: parametres_metier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametres_metier (
    id text NOT NULL,
    cle text NOT NULL,
    valeur text NOT NULL,
    type text DEFAULT 'STRING'::text NOT NULL,
    categorie text DEFAULT 'GENERAL'::text NOT NULL,
    libelle text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projet_affectations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projet_affectations (
    id text NOT NULL,
    "userId" text NOT NULL,
    "projetId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projet_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projet_status_history (
    id text NOT NULL,
    "projetId" text NOT NULL,
    "ancienStatut" text,
    "nouveauStatut" text NOT NULL,
    motif text,
    "changedByEmail" text,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projets (
    id text NOT NULL,
    code text NOT NULL,
    nom text,
    description text,
    bailleur text,
    "dateDebut" timestamp(3) without time zone,
    "dateFin" timestamp(3) without time zone,
    "budgetGnf" bigint,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    intitule text NOT NULL,
    "avancementFinancier" double precision DEFAULT 0 NOT NULL,
    "avancementPhysique" double precision DEFAULT 0 NOT NULL,
    "axeStrategique" text,
    "bailleurPrincipal" text,
    "bailleurSecondaire" text,
    "budgetInitialGnf" bigint DEFAULT 0 NOT NULL,
    "budgetReviseGnf" bigint DEFAULT 0 NOT NULL,
    categorie text,
    "chefProjetNom" text,
    commune text,
    "dateCloture" timestamp(3) without time zone,
    "dateDemarrage" timestamp(3) without time zone,
    "dateOs" timestamp(3) without time zone,
    "datePrevFinTravaux" timestamp(3) without time zone,
    "dateReceptionDef" timestamp(3) without time zone,
    "dateReceptionProv" timestamp(3) without time zone,
    "delaiMois" integer,
    "directionPorteuse" text,
    "latGps" double precision,
    "lonGps" double precision,
    "missionControle" text,
    "montantEngageGnf" bigint DEFAULT 0 NOT NULL,
    "montantOrdonnanceGnf" bigint DEFAULT 0 NOT NULL,
    "montantPayeGnf" bigint DEFAULT 0 NOT NULL,
    "montantRestantGnf" bigint DEFAULT 0 NOT NULL,
    "motifStatut" text,
    "niveauConfiance" text DEFAULT 'MOYEN'::text NOT NULL,
    observations text,
    "pkDebut" double precision,
    "pkFin" double precision,
    prefecture text,
    programme text,
    region text,
    "responsableNom" text,
    "scoreCout" double precision,
    "scoreDelai" double precision,
    "scoreRisque" double precision,
    "sourceFinancement" text,
    "tauxDecaissement" double precision DEFAULT 0 NOT NULL,
    troncon text,
    type public."TypeProjet" DEFAULT 'TRAVAUX_ROUTIERS'::public."TypeProjet" NOT NULL,
    ugp text,
    statut public."StatutProjet" DEFAULT 'PREPARATION'::public."StatutProjet" NOT NULL
);


--
-- Name: receptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receptions (
    id text NOT NULL,
    "marcheId" text NOT NULL,
    type text NOT NULL,
    statut text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    "datePrevu" timestamp(3) without time zone,
    "dateReelle" timestamp(3) without time zone,
    "pvNumero" text,
    "presentsEntreprise" text,
    "presentsAgeroute" text,
    "presentsAutres" text,
    reserves jsonb,
    "delaiLeveeReserves" integer,
    "dateLeveeReserves" timestamp(3) without time zone,
    observations text,
    "signedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    pieces jsonb
);


--
-- Name: ref_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_documents (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_id text,
    ouvrage_id text,
    titre text NOT NULL,
    type text,
    url text NOT NULL,
    taille_ko integer,
    date_doc date,
    auteur text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_historique; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_historique (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_id text,
    ouvrage_id text,
    user_id text,
    user_nom text,
    action text NOT NULL,
    champ text,
    ancienne_valeur text,
    nouvelle_valeur text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_inspections (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_id text,
    ouvrage_id text,
    date_inspection date NOT NULL,
    type_inspection text DEFAULT 'ROUTINE'::text,
    inspecteur text,
    etat text,
    indice_qualite double precision,
    degradations jsonb,
    recommandations text,
    rapport_url text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_maintenance (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_id text,
    ouvrage_id text,
    type_travaux text NOT NULL,
    entreprise text,
    marche_id text,
    montant_gnf bigint,
    date_debut date,
    date_fin date,
    duree_jours integer,
    garantie_mois integer,
    date_fin_garantie date,
    etat_avant text,
    etat_apres text,
    observations text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_ouvrages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_ouvrages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_code text,
    type text NOT NULL,
    nom text,
    code text,
    pk_localisation double precision,
    lat double precision,
    lng double precision,
    etat text DEFAULT 'MOYEN'::text,
    longueur double precision,
    largeur double precision,
    hauteur double precision,
    nb_travees integer,
    materiaux text,
    annee_construction integer,
    observations text,
    statut text DEFAULT 'ACTIF'::text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_photos (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    troncon_id text,
    ouvrage_id text,
    url text NOT NULL,
    caption text,
    type text DEFAULT 'GENERAL'::text,
    prise_le date,
    auteur text,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: ref_troncons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_troncons (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    code text NOT NULL,
    nom text NOT NULL,
    route text,
    classe text,
    categorie text,
    statut text DEFAULT 'ACTIF'::text,
    longueur double precision,
    sens text,
    region text,
    prefecture text,
    sous_prefecture text,
    commune text,
    village text,
    pk_debut double precision,
    pk_fin double precision,
    lat_debut double precision,
    lng_debut double precision,
    lat_fin double precision,
    lng_fin double precision,
    altitude_moy double precision,
    geojson jsonb,
    largeur_chaussee double precision,
    largeur_plateforme double precision,
    nb_voies integer DEFAULT 2,
    revetement text,
    nature_sol text,
    drainage text,
    classe_trafic text,
    vitesse_ref integer,
    charge_admissible double precision,
    annee_construction integer,
    derniere_rehabilitation integer,
    entreprise_executante text,
    bureau_controle text,
    indice_qualite double precision,
    etat text DEFAULT 'MOYEN'::text,
    niveau_service text,
    degradations jsonb,
    date_inspection timestamp with time zone,
    inspecteur text,
    commentaires text,
    observations text,
    createdat timestamp with time zone DEFAULT now(),
    updatedat timestamp with time zone DEFAULT now(),
    createdby text
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    token text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: regle_gestion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regle_gestion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cle text NOT NULL,
    categorie text NOT NULL,
    libelle text NOT NULL,
    description text,
    type text NOT NULL,
    options jsonb,
    portee text DEFAULT 'GLOBAL'::text NOT NULL,
    "porteeId" text DEFAULT ''::text NOT NULL,
    valeur text NOT NULL,
    "valeurDefaut" text NOT NULL,
    "dateEffet" timestamp(3) without time zone DEFAULT now() NOT NULL,
    statut text DEFAULT 'BROUILLON'::text NOT NULL,
    "saisiPar" uuid,
    "validePar" uuid,
    "valideAt" timestamp(3) without time zone,
    motif text DEFAULT ''::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "motifRejet" text,
    "soumisAt" timestamp(3) without time zone,
    "soumisPar" uuid,
    CONSTRAINT regle_gestion_portee_ck CHECK ((portee = ANY (ARRAY['GLOBAL'::text, 'BAILLEUR'::text, 'TYPE_MARCHE'::text, 'MARCHE'::text]))),
    CONSTRAINT regle_gestion_statut_ck CHECK ((statut = ANY (ARRAY['BROUILLON'::text, 'SOUMISE'::text, 'APPROUVEE'::text, 'REJETEE'::text, 'GELEE'::text, 'ARCHIVE'::text])))
);


--
-- Name: COLUMN regle_gestion."motifRejet"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regle_gestion."motifRejet" IS 'Motif obligatoire du rejet (quatre yeux)';


--
-- Name: COLUMN regle_gestion."soumisAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regle_gestion."soumisAt" IS 'Horodatage de la soumission à validation';


--
-- Name: COLUMN regle_gestion."soumisPar"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regle_gestion."soumisPar" IS 'UUID du saisisseur qui a soumis la règle';


--
-- Name: regle_gestion_historique; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regle_gestion_historique (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "regleId" uuid NOT NULL,
    cle text NOT NULL,
    ancienne text,
    nouvelle text NOT NULL,
    "dateEffet" timestamp(3) without time zone NOT NULL,
    "saisiPar" uuid NOT NULL,
    "validePar" uuid,
    motif text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL
);


--
-- Name: revision_composantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revision_composantes (
    id text NOT NULL,
    "formuleId" text NOT NULL,
    nom text NOT NULL,
    coefficient double precision NOT NULL,
    "indexCode" text NOT NULL,
    "valeurBase" double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sig_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_attempts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    sig_id text NOT NULL,
    attempt_no integer NOT NULL,
    result text NOT NULL,
    failure_reason text,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sig_attempts_result_check CHECK ((result = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text, 'BLOCKED'::text, 'TIMEOUT'::text])))
);


--
-- Name: sig_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    sig_id text NOT NULL,
    event_type text NOT NULL,
    event_status text NOT NULL,
    message text,
    event_data jsonb,
    ip_address text,
    user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sig_events_event_type_check CHECK ((event_type = ANY (ARRAY['CREATED'::text, 'OPENED'::text, 'AUTH_SUCCESS'::text, 'AUTH_FAILED'::text, 'SIGNED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'EXPIRED'::text, 'REVOKED'::text, 'ARCHIVED'::text, 'PACKAGE_GENERATED'::text, 'PRINTED'::text])))
);


--
-- Name: sig_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_objects (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    object_ref text,
    title text NOT NULL,
    current_version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sig_objects_object_type_check CHECK ((object_type = ANY (ARRAY['MARCHE'::text, 'DECOMPTE'::text, 'PAIEMENT'::text, 'RECEPTION'::text, 'AVENANT'::text, 'CONVENTION'::text, 'DOCUMENT'::text]))),
    CONSTRAINT sig_objects_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'signed'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text, 'revoked'::text, 'archived'::text])))
);


--
-- Name: sig_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_packages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    sig_object_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    package_hash text,
    certificate_data jsonb,
    qr_code text,
    print_count integer DEFAULT 0 NOT NULL,
    generated_at timestamp with time zone,
    archived_at timestamp with time zone,
    generated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sig_packages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generated'::text, 'ready_to_print'::text, 'printed'::text, 'reprinted'::text, 'archived'::text, 'invalidated'::text, 'cancelled'::text])))
);


--
-- Name: sig_print_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_print_history (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    package_id text NOT NULL,
    print_no integer NOT NULL,
    copies integer DEFAULT 1 NOT NULL,
    printer_name text,
    recipient text,
    operator_id text NOT NULL,
    motif text,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sig_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sig_signatures (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    sig_object_id text NOT NULL,
    signer_user_id text NOT NULL,
    signer_role text NOT NULL,
    signer_nom text,
    signature_method text DEFAULT 'PASSWORD'::text NOT NULL,
    signature_status text DEFAULT 'pending'::text NOT NULL,
    signed_at timestamp with time zone,
    ip_address text,
    user_agent text,
    signature_hash text,
    certificate_id text,
    reason text,
    attempt_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sig_signatures_signature_method_check CHECK ((signature_method = ANY (ARRAY['PASSWORD'::text, 'OTP'::text, 'CERTIFICAT'::text, 'BIOMETRIQUE'::text]))),
    CONSTRAINT sig_signatures_signature_status_check CHECK ((signature_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'signed'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: user_module_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_module_access (
    id text NOT NULL,
    "userId" text NOT NULL,
    "moduleKey" text NOT NULL,
    allowed boolean NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "nomComplet" text NOT NULL,
    "passwordHash" text NOT NULL,
    role public."Role" DEFAULT 'MISSION'::public."Role" NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    "derniereConnexion" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "entrepriseId" text,
    nom text,
    prenom text,
    fonction text,
    "signatureUrl" text
);


--
-- Name: COLUMN users.nom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.nom IS 'Nom de famille, pour les mentions officielles des documents';


--
-- Name: COLUMN users.prenom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.prenom IS 'Prénom, pour les mentions officielles des documents';


--
-- Name: COLUMN users.fonction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.fonction IS 'Titre exact porté sur les documents (distinct du rôle applicatif)';


--
-- Name: COLUMN users."signatureUrl"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."signatureUrl" IS 'Spécimen de signature déposé via /api/uploads — complète le cachet cryptographique, ne le remplace pas';


--
-- Name: workflow_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_actions (
    id text NOT NULL,
    "instanceId" text NOT NULL,
    "etapeId" text NOT NULL,
    "userId" text NOT NULL,
    decision text NOT NULL,
    commentaire text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: workflow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definitions (
    id text NOT NULL,
    nom text NOT NULL,
    financement public."TypeFinancement" NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: workflow_etapes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_etapes (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    ordre integer NOT NULL,
    nom text NOT NULL,
    "roleRequis" public."Role" NOT NULL,
    "slaDays" integer DEFAULT 5 NOT NULL
);


--
-- Name: workflow_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_instances (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    "marcheId" text,
    "decompteId" text,
    "etapeActuelle" integer DEFAULT 0 NOT NULL,
    statut public."StatutWorkflow" DEFAULT 'EN_COURS'::public."StatutWorkflow" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: alertes_entreprises alertes_entreprises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertes_entreprises
    ADD CONSTRAINT alertes_entreprises_pkey PRIMARY KEY (id);


--
-- Name: alertes alertes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertes
    ADD CONSTRAINT alertes_pkey PRIMARY KEY (id);


--
-- Name: attachement_commentaires attachement_commentaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_commentaires
    ADD CONSTRAINT attachement_commentaires_pkey PRIMARY KEY (id);


--
-- Name: attachement_gps attachement_gps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_gps
    ADD CONSTRAINT attachement_gps_pkey PRIMARY KEY (id);


--
-- Name: attachement_lignes attachement_lignes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_lignes
    ADD CONSTRAINT attachement_lignes_pkey PRIMARY KEY (id);


--
-- Name: attachement_medias attachement_medias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_medias
    ADD CONSTRAINT attachement_medias_pkey PRIMARY KEY (id);


--
-- Name: attachement_mesures attachement_mesures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_mesures
    ADD CONSTRAINT attachement_mesures_pkey PRIMARY KEY (id);


--
-- Name: attachement_validations attachement_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_validations
    ADD CONSTRAINT attachement_validations_pkey PRIMARY KEY (id);


--
-- Name: attachements attachements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachements
    ADD CONSTRAINT attachements_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: avenants avenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avenants
    ADD CONSTRAINT avenants_pkey PRIMARY KEY (id);


--
-- Name: bpmn_actions bpmn_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_actions
    ADD CONSTRAINT bpmn_actions_pkey PRIMARY KEY (id);


--
-- Name: bpmn_definitions bpmn_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_definitions
    ADD CONSTRAINT bpmn_definitions_pkey PRIMARY KEY (id);


--
-- Name: bpmn_instances bpmn_instances_module_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_instances
    ADD CONSTRAINT bpmn_instances_module_type_entity_id_key UNIQUE (module_type, entity_id);


--
-- Name: bpmn_instances bpmn_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_instances
    ADD CONSTRAINT bpmn_instances_pkey PRIMARY KEY (id);


--
-- Name: bpmn_steps bpmn_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_steps
    ADD CONSTRAINT bpmn_steps_pkey PRIMARY KEY (id);


--
-- Name: bpu_articles bpu_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpu_articles
    ADD CONSTRAINT bpu_articles_pkey PRIMARY KEY (id);


--
-- Name: circuit_financier_etapes circuit_financier_etapes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_financier_etapes
    ADD CONSTRAINT circuit_financier_etapes_pkey PRIMARY KEY (id);


--
-- Name: circuits_financiers circuits_financiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuits_financiers
    ADD CONSTRAINT circuits_financiers_pkey PRIMARY KEY (id);


--
-- Name: company_markets company_markets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_markets
    ADD CONSTRAINT company_markets_pkey PRIMARY KEY (id);


--
-- Name: company_status_history company_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_status_history
    ADD CONSTRAINT company_status_history_pkey PRIMARY KEY (id);


--
-- Name: company_users company_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT company_users_pkey PRIMARY KEY (id);


--
-- Name: conformite_verifications conformite_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conformite_verifications
    ADD CONSTRAINT conformite_verifications_pkey PRIMARY KEY (id);


--
-- Name: contacts_entreprises contacts_entreprises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts_entreprises
    ADD CONSTRAINT contacts_entreprises_pkey PRIMARY KEY (id);


--
-- Name: decompte_commentaires decompte_commentaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_commentaires
    ADD CONSTRAINT decompte_commentaires_pkey PRIMARY KEY (id);


--
-- Name: decompte_lignes decompte_lignes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_lignes
    ADD CONSTRAINT decompte_lignes_pkey PRIMARY KEY (id);


--
-- Name: decompte_payment_traces decompte_payment_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_payment_traces
    ADD CONSTRAINT decompte_payment_traces_pkey PRIMARY KEY (id);


--
-- Name: decompte_validations_avancees decompte_validations_avancees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_validations_avancees
    ADD CONSTRAINT decompte_validations_avancees_pkey PRIMARY KEY (id);


--
-- Name: decomptes decomptes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decomptes
    ADD CONSTRAINT decomptes_pkey PRIMARY KEY (id);


--
-- Name: delegations delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);


--
-- Name: documents_entreprises documents_entreprises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents_entreprises
    ADD CONSTRAINT documents_entreprises_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: entreprises entreprises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entreprises
    ADD CONSTRAINT entreprises_pkey PRIMARY KEY (id);


--
-- Name: formules_revision formules_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formules_revision
    ADD CONSTRAINT formules_revision_pkey PRIMARY KEY (id);


--
-- Name: funding_allocations funding_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_allocations
    ADD CONSTRAINT funding_allocations_pkey PRIMARY KEY (id);


--
-- Name: funding_consumptions funding_consumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_consumptions
    ADD CONSTRAINT funding_consumptions_pkey PRIMARY KEY (id);


--
-- Name: funding_documents funding_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_documents
    ADD CONSTRAINT funding_documents_pkey PRIMARY KEY (id);


--
-- Name: funding_envelopes funding_envelopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_envelopes
    ADD CONSTRAINT funding_envelopes_pkey PRIMARY KEY (id);


--
-- Name: funding_sources funding_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_sources
    ADD CONSTRAINT funding_sources_pkey PRIMARY KEY (id);


--
-- Name: funding_status_history funding_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_status_history
    ADD CONSTRAINT funding_status_history_pkey PRIMARY KEY (id);


--
-- Name: garanties garanties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garanties
    ADD CONSTRAINT garanties_pkey PRIMARY KEY (id);


--
-- Name: historique_statuts_marche historique_statuts_marche_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historique_statuts_marche
    ADD CONSTRAINT historique_statuts_marche_pkey PRIMARY KEY (id);


--
-- Name: index_mensuels index_mensuels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.index_mensuels
    ADD CONSTRAINT index_mensuels_pkey PRIMARY KEY (id);


--
-- Name: lignes_budgetaires lignes_budgetaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lignes_budgetaires
    ADD CONSTRAINT lignes_budgetaires_pkey PRIMARY KEY (id);


--
-- Name: lots lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lots
    ADD CONSTRAINT lots_pkey PRIMARY KEY (id);


--
-- Name: marche_affectations marche_affectations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marche_affectations
    ADD CONSTRAINT marche_affectations_pkey PRIMARY KEY (id);


--
-- Name: marches marches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marches
    ADD CONSTRAINT marches_pkey PRIMARY KEY (id);


--
-- Name: ordres_service ordres_service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordres_service
    ADD CONSTRAINT ordres_service_pkey PRIMARY KEY (id);


--
-- Name: paiements paiements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_pkey PRIMARY KEY (id);


--
-- Name: parametres_metier parametres_metier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametres_metier
    ADD CONSTRAINT parametres_metier_pkey PRIMARY KEY (id);


--
-- Name: projet_affectations projet_affectations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projet_affectations
    ADD CONSTRAINT projet_affectations_pkey PRIMARY KEY (id);


--
-- Name: projet_status_history projet_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projet_status_history
    ADD CONSTRAINT projet_status_history_pkey PRIMARY KEY (id);


--
-- Name: projets projets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projets
    ADD CONSTRAINT projets_pkey PRIMARY KEY (id);


--
-- Name: receptions receptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT receptions_pkey PRIMARY KEY (id);


--
-- Name: ref_documents ref_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_documents
    ADD CONSTRAINT ref_documents_pkey PRIMARY KEY (id);


--
-- Name: ref_historique ref_historique_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_historique
    ADD CONSTRAINT ref_historique_pkey PRIMARY KEY (id);


--
-- Name: ref_inspections ref_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_inspections
    ADD CONSTRAINT ref_inspections_pkey PRIMARY KEY (id);


--
-- Name: ref_maintenance ref_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_maintenance
    ADD CONSTRAINT ref_maintenance_pkey PRIMARY KEY (id);


--
-- Name: ref_ouvrages ref_ouvrages_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_ouvrages
    ADD CONSTRAINT ref_ouvrages_code_key UNIQUE (code);


--
-- Name: ref_ouvrages ref_ouvrages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_ouvrages
    ADD CONSTRAINT ref_ouvrages_pkey PRIMARY KEY (id);


--
-- Name: ref_photos ref_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_photos
    ADD CONSTRAINT ref_photos_pkey PRIMARY KEY (id);


--
-- Name: ref_troncons ref_troncons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_troncons
    ADD CONSTRAINT ref_troncons_code_key UNIQUE (code);


--
-- Name: ref_troncons ref_troncons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_troncons
    ADD CONSTRAINT ref_troncons_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: regle_gestion_historique regle_gestion_historique_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regle_gestion_historique
    ADD CONSTRAINT regle_gestion_historique_pkey PRIMARY KEY (id);


--
-- Name: regle_gestion regle_gestion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regle_gestion
    ADD CONSTRAINT regle_gestion_pkey PRIMARY KEY (id);


--
-- Name: regle_gestion regle_gestion_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regle_gestion
    ADD CONSTRAINT regle_gestion_uniq UNIQUE (cle, portee, "porteeId", "dateEffet", version);


--
-- Name: revision_composantes revision_composantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revision_composantes
    ADD CONSTRAINT revision_composantes_pkey PRIMARY KEY (id);


--
-- Name: sig_attempts sig_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_attempts
    ADD CONSTRAINT sig_attempts_pkey PRIMARY KEY (id);


--
-- Name: sig_events sig_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_events
    ADD CONSTRAINT sig_events_pkey PRIMARY KEY (id);


--
-- Name: sig_objects sig_objects_object_type_object_id_current_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_objects
    ADD CONSTRAINT sig_objects_object_type_object_id_current_version_key UNIQUE (object_type, object_id, current_version);


--
-- Name: sig_objects sig_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_objects
    ADD CONSTRAINT sig_objects_pkey PRIMARY KEY (id);


--
-- Name: sig_packages sig_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_packages
    ADD CONSTRAINT sig_packages_pkey PRIMARY KEY (id);


--
-- Name: sig_print_history sig_print_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_print_history
    ADD CONSTRAINT sig_print_history_pkey PRIMARY KEY (id);


--
-- Name: sig_signatures sig_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_signatures
    ADD CONSTRAINT sig_signatures_pkey PRIMARY KEY (id);


--
-- Name: user_module_access user_module_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_access
    ADD CONSTRAINT user_module_access_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workflow_actions workflow_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT workflow_actions_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_etapes workflow_etapes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_etapes
    ADD CONSTRAINT workflow_etapes_pkey PRIMARY KEY (id);


--
-- Name: workflow_instances workflow_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);


--
-- Name: alertes_entiteType_entiteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alertes_entiteType_entiteId_idx" ON public.alertes USING btree ("entiteType", "entiteId");


--
-- Name: alertes_entreprises_entrepriseId_acquittee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "alertes_entreprises_entrepriseId_acquittee_idx" ON public.alertes_entreprises USING btree ("entrepriseId", acquittee);


--
-- Name: alertes_envoye_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alertes_envoye_idx ON public.alertes USING btree (envoye);


--
-- Name: attachement_commentaires_attachementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_commentaires_attachementId_idx" ON public.attachement_commentaires USING btree ("attachementId");


--
-- Name: attachement_gps_attachementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_gps_attachementId_idx" ON public.attachement_gps USING btree ("attachementId");


--
-- Name: attachement_lignes_attachementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_lignes_attachementId_idx" ON public.attachement_lignes USING btree ("attachementId");


--
-- Name: attachement_medias_attachementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_medias_attachementId_idx" ON public.attachement_medias USING btree ("attachementId");


--
-- Name: attachement_mesures_ligneId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_mesures_ligneId_idx" ON public.attachement_mesures USING btree ("ligneId");


--
-- Name: attachement_validations_attachementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachement_validations_attachementId_idx" ON public.attachement_validations USING btree ("attachementId");


--
-- Name: attachements_bpuArticleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachements_bpuArticleId_idx" ON public.attachements USING btree ("bpuArticleId");


--
-- Name: attachements_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attachements_decompteId_idx" ON public.attachements USING btree ("decompteId");


--
-- Name: attachements_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachements_statut_idx ON public.attachements USING btree (statut);


--
-- Name: audit_logs_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_entityType_entityId_idx" ON public.audit_logs USING btree ("entityType", "entityId");


--
-- Name: audit_logs_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_userId_idx" ON public.audit_logs USING btree ("userId");


--
-- Name: avenants_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "avenants_marcheId_idx" ON public.avenants USING btree ("marcheId");


--
-- Name: bpu_articles_lotId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "bpu_articles_lotId_idx" ON public.bpu_articles USING btree ("lotId");


--
-- Name: bpu_articles_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "bpu_articles_marcheId_idx" ON public.bpu_articles USING btree ("marcheId");


--
-- Name: circuit_financier_etapes_circuitId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "circuit_financier_etapes_circuitId_idx" ON public.circuit_financier_etapes USING btree ("circuitId");


--
-- Name: circuits_financiers_decompteId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "circuits_financiers_decompteId_key" ON public.circuits_financiers USING btree ("decompteId");


--
-- Name: company_markets_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_markets_entrepriseId_idx" ON public.company_markets USING btree ("entrepriseId");


--
-- Name: company_markets_entrepriseId_marcheId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "company_markets_entrepriseId_marcheId_key" ON public.company_markets USING btree ("entrepriseId", "marcheId");


--
-- Name: company_markets_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_markets_marcheId_idx" ON public.company_markets USING btree ("marcheId");


--
-- Name: company_status_history_entrepriseId_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_status_history_entrepriseId_changedAt_idx" ON public.company_status_history USING btree ("entrepriseId", "changedAt");


--
-- Name: company_users_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_users_entrepriseId_idx" ON public.company_users USING btree ("entrepriseId");


--
-- Name: company_users_entrepriseId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "company_users_entrepriseId_userId_key" ON public.company_users USING btree ("entrepriseId", "userId");


--
-- Name: company_users_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "company_users_userId_idx" ON public.company_users USING btree ("userId");


--
-- Name: conformite_verifications_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "conformite_verifications_entrepriseId_idx" ON public.conformite_verifications USING btree ("entrepriseId");


--
-- Name: contacts_entreprises_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "contacts_entreprises_entrepriseId_idx" ON public.contacts_entreprises USING btree ("entrepriseId");


--
-- Name: decompte_commentaires_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decompte_commentaires_decompteId_idx" ON public.decompte_commentaires USING btree ("decompteId");


--
-- Name: decompte_lignes_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decompte_lignes_decompteId_idx" ON public.decompte_lignes USING btree ("decompteId");


--
-- Name: decompte_payment_traces_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decompte_payment_traces_decompteId_idx" ON public.decompte_payment_traces USING btree ("decompteId");


--
-- Name: decompte_validations_avancees_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decompte_validations_avancees_decompteId_idx" ON public.decompte_validations_avancees USING btree ("decompteId");


--
-- Name: decomptes_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decomptes_entrepriseId_idx" ON public.decomptes USING btree ("entrepriseId");


--
-- Name: decomptes_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "decomptes_marcheId_idx" ON public.decomptes USING btree ("marcheId");


--
-- Name: decomptes_numeroDossier_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "decomptes_numeroDossier_key" ON public.decomptes USING btree ("numeroDossier");


--
-- Name: decomptes_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX decomptes_reference_key ON public.decomptes USING btree (reference);


--
-- Name: decomptes_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX decomptes_statut_idx ON public.decomptes USING btree (statut);


--
-- Name: decomptes_tokenSignature_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "decomptes_tokenSignature_key" ON public.decomptes USING btree ("tokenSignature");


--
-- Name: delegations_suppleantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "delegations_suppleantId_idx" ON public.delegations USING btree ("suppleantId");


--
-- Name: delegations_titulaireId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "delegations_titulaireId_idx" ON public.delegations USING btree ("titulaireId");


--
-- Name: documents_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_decompteId_idx" ON public.documents USING btree ("decompteId");


--
-- Name: documents_decompte_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_decompte_statut_idx ON public.documents USING btree ("decompteId", "statutValidation");


--
-- Name: documents_entreprises_entrepriseId_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_entreprises_entrepriseId_type_idx" ON public.documents_entreprises USING btree ("entrepriseId", type);


--
-- Name: documents_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_type_idx ON public.documents USING btree (type);


--
-- Name: entreprises_nif_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entreprises_nif_key ON public.entreprises USING btree (nif);


--
-- Name: entreprises_scoreConformite_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "entreprises_scoreConformite_idx" ON public.entreprises USING btree ("scoreConformite");


--
-- Name: entreprises_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entreprises_statut_idx ON public.entreprises USING btree (statut);


--
-- Name: formules_revision_marcheId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "formules_revision_marcheId_key" ON public.formules_revision USING btree ("marcheId");


--
-- Name: funding_allocations_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_allocations_decompteId_idx" ON public.funding_allocations USING btree ("decompteId");


--
-- Name: funding_allocations_fundingEnvelopeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_allocations_fundingEnvelopeId_idx" ON public.funding_allocations USING btree ("fundingEnvelopeId");


--
-- Name: funding_allocations_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_allocations_marcheId_idx" ON public.funding_allocations USING btree ("marcheId");


--
-- Name: funding_allocations_projetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_allocations_projetId_idx" ON public.funding_allocations USING btree ("projetId");


--
-- Name: funding_allocations_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funding_allocations_statut_idx ON public.funding_allocations USING btree (statut);


--
-- Name: funding_consumptions_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_consumptions_entityType_entityId_idx" ON public.funding_consumptions USING btree ("entityType", "entityId");


--
-- Name: funding_consumptions_fundingAllocationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_consumptions_fundingAllocationId_idx" ON public.funding_consumptions USING btree ("fundingAllocationId");


--
-- Name: funding_documents_fundingSourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_documents_fundingSourceId_idx" ON public.funding_documents USING btree ("fundingSourceId");


--
-- Name: funding_documents_validationStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_documents_validationStatus_idx" ON public.funding_documents USING btree ("validationStatus");


--
-- Name: funding_envelopes_envelopeCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "funding_envelopes_envelopeCode_key" ON public.funding_envelopes USING btree ("envelopeCode");


--
-- Name: funding_envelopes_fundingSourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_envelopes_fundingSourceId_idx" ON public.funding_envelopes USING btree ("fundingSourceId");


--
-- Name: funding_envelopes_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funding_envelopes_statut_idx ON public.funding_envelopes USING btree (statut);


--
-- Name: funding_sources_sourceCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "funding_sources_sourceCode_key" ON public.funding_sources USING btree ("sourceCode");


--
-- Name: funding_sources_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funding_sources_statut_idx ON public.funding_sources USING btree (statut);


--
-- Name: funding_status_history_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "funding_status_history_entityType_entityId_idx" ON public.funding_status_history USING btree ("entityType", "entityId");


--
-- Name: garanties_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "garanties_marcheId_idx" ON public.garanties USING btree ("marcheId");


--
-- Name: historique_statuts_marche_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "historique_statuts_marche_marcheId_idx" ON public.historique_statuts_marche USING btree ("marcheId");


--
-- Name: index_mensuels_code_annee_mois_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_mensuels_code_annee_mois_key ON public.index_mensuels USING btree (code, annee, mois);


--
-- Name: index_mensuels_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_mensuels_code_idx ON public.index_mensuels USING btree (code);


--
-- Name: lignes_budgetaires_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lignes_budgetaires_code_key ON public.lignes_budgetaires USING btree (code);


--
-- Name: lots_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lots_marcheId_idx" ON public.lots USING btree ("marcheId");


--
-- Name: marche_affectations_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marche_affectations_userId_idx" ON public.marche_affectations USING btree ("userId");


--
-- Name: marche_affectations_userId_marcheId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "marche_affectations_userId_marcheId_key" ON public.marche_affectations USING btree ("userId", "marcheId");


--
-- Name: marches_entrepriseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marches_entrepriseId_idx" ON public.marches USING btree ("entrepriseId");


--
-- Name: marches_projetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "marches_projetId_idx" ON public.marches USING btree ("projetId");


--
-- Name: marches_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marches_reference_key ON public.marches USING btree (reference);


--
-- Name: marches_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marches_statut_idx ON public.marches USING btree (statut);


--
-- Name: ordres_service_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ordres_service_marcheId_idx" ON public.ordres_service USING btree ("marcheId");


--
-- Name: paiements_decompteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "paiements_decompteId_idx" ON public.paiements USING btree ("decompteId");


--
-- Name: paiements_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "paiements_deletedAt_idx" ON public.paiements USING btree ("deletedAt");


--
-- Name: parametres_metier_cle_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parametres_metier_cle_key ON public.parametres_metier USING btree (cle);


--
-- Name: projet_affectations_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "projet_affectations_userId_idx" ON public.projet_affectations USING btree ("userId");


--
-- Name: projet_affectations_userId_projetId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "projet_affectations_userId_projetId_key" ON public.projet_affectations USING btree ("userId", "projetId");


--
-- Name: projet_status_history_projetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "projet_status_history_projetId_idx" ON public.projet_status_history USING btree ("projetId");


--
-- Name: projets_bailleurPrincipal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "projets_bailleurPrincipal_idx" ON public.projets USING btree ("bailleurPrincipal");


--
-- Name: projets_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projets_code_key ON public.projets USING btree (code);


--
-- Name: projets_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projets_region_idx ON public.projets USING btree (region);


--
-- Name: projets_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projets_statut_idx ON public.projets USING btree (statut);


--
-- Name: receptions_marcheId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receptions_marcheId_idx" ON public.receptions USING btree ("marcheId");


--
-- Name: receptions_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receptions_statut_idx ON public.receptions USING btree (statut);


--
-- Name: refresh_tokens_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens USING btree (token);


--
-- Name: refresh_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_userId_idx" ON public.refresh_tokens USING btree ("userId");


--
-- Name: regle_gestion_histo_cle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regle_gestion_histo_cle_idx ON public.regle_gestion_historique USING btree (cle);


--
-- Name: regle_gestion_histo_regle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regle_gestion_histo_regle_idx ON public.regle_gestion_historique USING btree ("regleId");


--
-- Name: regle_gestion_resolution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regle_gestion_resolution_idx ON public.regle_gestion USING btree (cle, portee, "porteeId", "dateEffet" DESC);


--
-- Name: regle_gestion_statut_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regle_gestion_statut_idx ON public.regle_gestion USING btree (statut);


--
-- Name: regle_gestion_statut_portee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regle_gestion_statut_portee_idx ON public.regle_gestion USING btree (statut, portee, "porteeId");


--
-- Name: revision_composantes_formuleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "revision_composantes_formuleId_idx" ON public.revision_composantes USING btree ("formuleId");


--
-- Name: sig_attempts_sig_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_attempts_sig_idx ON public.sig_attempts USING btree (sig_id);


--
-- Name: sig_events_sig_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_events_sig_idx ON public.sig_events USING btree (sig_id);


--
-- Name: sig_objects_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_objects_status_idx ON public.sig_objects USING btree (status);


--
-- Name: sig_objects_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_objects_type_idx ON public.sig_objects USING btree (object_type, object_id);


--
-- Name: sig_packages_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_packages_object_idx ON public.sig_packages USING btree (sig_object_id);


--
-- Name: sig_signatures_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_signatures_object_idx ON public.sig_signatures USING btree (sig_object_id);


--
-- Name: sig_signatures_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sig_signatures_user_idx ON public.sig_signatures USING btree (signer_user_id);


--
-- Name: user_module_access_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_module_access_userId_idx" ON public.user_module_access USING btree ("userId");


--
-- Name: user_module_access_userId_moduleKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_module_access_userId_moduleKey_key" ON public.user_module_access USING btree ("userId", "moduleKey");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: workflow_etapes_definitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "workflow_etapes_definitionId_idx" ON public.workflow_etapes USING btree ("definitionId");


--
-- Name: alertes_entreprises alertes_entreprises_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertes_entreprises
    ADD CONSTRAINT "alertes_entreprises_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attachement_commentaires attachement_commentaires_attachementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_commentaires
    ADD CONSTRAINT "attachement_commentaires_attachementId_fkey" FOREIGN KEY ("attachementId") REFERENCES public.attachements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachement_gps attachement_gps_attachementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_gps
    ADD CONSTRAINT "attachement_gps_attachementId_fkey" FOREIGN KEY ("attachementId") REFERENCES public.attachements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachement_lignes attachement_lignes_attachementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_lignes
    ADD CONSTRAINT "attachement_lignes_attachementId_fkey" FOREIGN KEY ("attachementId") REFERENCES public.attachements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachement_medias attachement_medias_attachementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_medias
    ADD CONSTRAINT "attachement_medias_attachementId_fkey" FOREIGN KEY ("attachementId") REFERENCES public.attachements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachement_mesures attachement_mesures_ligneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_mesures
    ADD CONSTRAINT "attachement_mesures_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES public.attachement_lignes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachement_validations attachement_validations_attachementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachement_validations
    ADD CONSTRAINT "attachement_validations_attachementId_fkey" FOREIGN KEY ("attachementId") REFERENCES public.attachements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: attachements attachements_bpuArticleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachements
    ADD CONSTRAINT "attachements_bpuArticleId_fkey" FOREIGN KEY ("bpuArticleId") REFERENCES public.bpu_articles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attachements attachements_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachements
    ADD CONSTRAINT "attachements_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attachements attachements_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachements
    ADD CONSTRAINT "attachements_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: avenants avenants_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avenants
    ADD CONSTRAINT "avenants_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bpmn_actions bpmn_actions_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_actions
    ADD CONSTRAINT bpmn_actions_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.bpmn_instances(id) ON DELETE CASCADE;


--
-- Name: bpmn_instances bpmn_instances_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_instances
    ADD CONSTRAINT bpmn_instances_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.bpmn_definitions(id);


--
-- Name: bpmn_steps bpmn_steps_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpmn_steps
    ADD CONSTRAINT bpmn_steps_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.bpmn_definitions(id) ON DELETE CASCADE;


--
-- Name: bpu_articles bpu_articles_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpu_articles
    ADD CONSTRAINT "bpu_articles_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public.lots(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: bpu_articles bpu_articles_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpu_articles
    ADD CONSTRAINT "bpu_articles_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: circuit_financier_etapes circuit_financier_etapes_circuitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_financier_etapes
    ADD CONSTRAINT "circuit_financier_etapes_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES public.circuits_financiers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: circuits_financiers circuits_financiers_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuits_financiers
    ADD CONSTRAINT "circuits_financiers_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: company_markets company_markets_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_markets
    ADD CONSTRAINT "company_markets_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: company_markets company_markets_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_markets
    ADD CONSTRAINT "company_markets_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: company_status_history company_status_history_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_status_history
    ADD CONSTRAINT "company_status_history_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: company_users company_users_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT "company_users_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: company_users company_users_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_users
    ADD CONSTRAINT "company_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conformite_verifications conformite_verifications_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conformite_verifications
    ADD CONSTRAINT "conformite_verifications_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: contacts_entreprises contacts_entreprises_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts_entreprises
    ADD CONSTRAINT "contacts_entreprises_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: decompte_commentaires decompte_commentaires_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_commentaires
    ADD CONSTRAINT "decompte_commentaires_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: decompte_lignes decompte_lignes_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_lignes
    ADD CONSTRAINT "decompte_lignes_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: decompte_payment_traces decompte_payment_traces_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_payment_traces
    ADD CONSTRAINT "decompte_payment_traces_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: decompte_validations_avancees decompte_validations_avancees_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decompte_validations_avancees
    ADD CONSTRAINT "decompte_validations_avancees_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: decomptes decomptes_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decomptes
    ADD CONSTRAINT "decomptes_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: decomptes decomptes_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decomptes
    ADD CONSTRAINT "decomptes_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public.lots(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: decomptes decomptes_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decomptes
    ADD CONSTRAINT "decomptes_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: decomptes decomptes_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decomptes
    ADD CONSTRAINT "decomptes_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: delegations delegations_suppleantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT "delegations_suppleantId_fkey" FOREIGN KEY ("suppleantId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: delegations delegations_titulaireId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT "delegations_titulaireId_fkey" FOREIGN KEY ("titulaireId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents_entreprises documents_entreprises_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents_entreprises
    ADD CONSTRAINT "documents_entreprises_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: formules_revision formules_revision_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formules_revision
    ADD CONSTRAINT "formules_revision_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: funding_allocations funding_allocations_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_allocations
    ADD CONSTRAINT "funding_allocations_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: funding_allocations funding_allocations_fundingEnvelopeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_allocations
    ADD CONSTRAINT "funding_allocations_fundingEnvelopeId_fkey" FOREIGN KEY ("fundingEnvelopeId") REFERENCES public.funding_envelopes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: funding_allocations funding_allocations_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_allocations
    ADD CONSTRAINT "funding_allocations_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: funding_allocations funding_allocations_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_allocations
    ADD CONSTRAINT "funding_allocations_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: funding_consumptions funding_consumptions_fundingAllocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_consumptions
    ADD CONSTRAINT "funding_consumptions_fundingAllocationId_fkey" FOREIGN KEY ("fundingAllocationId") REFERENCES public.funding_allocations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: funding_documents funding_documents_fundingSourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_documents
    ADD CONSTRAINT "funding_documents_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES public.funding_sources(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: funding_envelopes funding_envelopes_fundingSourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_envelopes
    ADD CONSTRAINT "funding_envelopes_fundingSourceId_fkey" FOREIGN KEY ("fundingSourceId") REFERENCES public.funding_sources(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: garanties garanties_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garanties
    ADD CONSTRAINT "garanties_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: historique_statuts_marche historique_statuts_marche_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historique_statuts_marche
    ADD CONSTRAINT "historique_statuts_marche_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lots lots_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lots
    ADD CONSTRAINT "lots_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: marche_affectations marche_affectations_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marche_affectations
    ADD CONSTRAINT "marche_affectations_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: marche_affectations marche_affectations_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marche_affectations
    ADD CONSTRAINT "marche_affectations_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: marches marches_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marches
    ADD CONSTRAINT "marches_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: marches marches_ligneBudgetaireId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marches
    ADD CONSTRAINT "marches_ligneBudgetaireId_fkey" FOREIGN KEY ("ligneBudgetaireId") REFERENCES public.lignes_budgetaires(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: marches marches_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marches
    ADD CONSTRAINT "marches_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ordres_service ordres_service_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordres_service
    ADD CONSTRAINT "ordres_service_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: paiements paiements_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT "paiements_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: projet_affectations projet_affectations_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projet_affectations
    ADD CONSTRAINT "projet_affectations_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projet_affectations projet_affectations_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projet_affectations
    ADD CONSTRAINT "projet_affectations_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projet_status_history projet_status_history_projetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projet_status_history
    ADD CONSTRAINT "projet_status_history_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES public.projets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: receptions receptions_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptions
    ADD CONSTRAINT "receptions_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ref_documents ref_documents_ouvrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_documents
    ADD CONSTRAINT ref_documents_ouvrage_id_fkey FOREIGN KEY (ouvrage_id) REFERENCES public.ref_ouvrages(id) ON DELETE CASCADE;


--
-- Name: ref_documents ref_documents_troncon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_documents
    ADD CONSTRAINT ref_documents_troncon_id_fkey FOREIGN KEY (troncon_id) REFERENCES public.ref_troncons(id) ON DELETE CASCADE;


--
-- Name: ref_historique ref_historique_ouvrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_historique
    ADD CONSTRAINT ref_historique_ouvrage_id_fkey FOREIGN KEY (ouvrage_id) REFERENCES public.ref_ouvrages(id) ON DELETE CASCADE;


--
-- Name: ref_historique ref_historique_troncon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_historique
    ADD CONSTRAINT ref_historique_troncon_id_fkey FOREIGN KEY (troncon_id) REFERENCES public.ref_troncons(id) ON DELETE CASCADE;


--
-- Name: ref_inspections ref_inspections_ouvrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_inspections
    ADD CONSTRAINT ref_inspections_ouvrage_id_fkey FOREIGN KEY (ouvrage_id) REFERENCES public.ref_ouvrages(id) ON DELETE CASCADE;


--
-- Name: ref_inspections ref_inspections_troncon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_inspections
    ADD CONSTRAINT ref_inspections_troncon_id_fkey FOREIGN KEY (troncon_id) REFERENCES public.ref_troncons(id) ON DELETE CASCADE;


--
-- Name: ref_maintenance ref_maintenance_ouvrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_maintenance
    ADD CONSTRAINT ref_maintenance_ouvrage_id_fkey FOREIGN KEY (ouvrage_id) REFERENCES public.ref_ouvrages(id) ON DELETE CASCADE;


--
-- Name: ref_maintenance ref_maintenance_troncon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_maintenance
    ADD CONSTRAINT ref_maintenance_troncon_id_fkey FOREIGN KEY (troncon_id) REFERENCES public.ref_troncons(id) ON DELETE CASCADE;


--
-- Name: ref_ouvrages ref_ouvrages_troncon_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_ouvrages
    ADD CONSTRAINT ref_ouvrages_troncon_code_fkey FOREIGN KEY (troncon_code) REFERENCES public.ref_troncons(code) ON DELETE SET NULL;


--
-- Name: ref_photos ref_photos_ouvrage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_photos
    ADD CONSTRAINT ref_photos_ouvrage_id_fkey FOREIGN KEY (ouvrage_id) REFERENCES public.ref_ouvrages(id) ON DELETE CASCADE;


--
-- Name: ref_photos ref_photos_troncon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_photos
    ADD CONSTRAINT ref_photos_troncon_id_fkey FOREIGN KEY (troncon_id) REFERENCES public.ref_troncons(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: regle_gestion_historique regle_gestion_histo_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regle_gestion_historique
    ADD CONSTRAINT regle_gestion_histo_fk FOREIGN KEY ("regleId") REFERENCES public.regle_gestion(id) ON DELETE CASCADE;


--
-- Name: revision_composantes revision_composantes_formuleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revision_composantes
    ADD CONSTRAINT "revision_composantes_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES public.formules_revision(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sig_attempts sig_attempts_sig_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_attempts
    ADD CONSTRAINT sig_attempts_sig_id_fkey FOREIGN KEY (sig_id) REFERENCES public.sig_signatures(id) ON DELETE CASCADE;


--
-- Name: sig_events sig_events_sig_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_events
    ADD CONSTRAINT sig_events_sig_id_fkey FOREIGN KEY (sig_id) REFERENCES public.sig_signatures(id) ON DELETE CASCADE;


--
-- Name: sig_packages sig_packages_sig_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_packages
    ADD CONSTRAINT sig_packages_sig_object_id_fkey FOREIGN KEY (sig_object_id) REFERENCES public.sig_objects(id) ON DELETE CASCADE;


--
-- Name: sig_print_history sig_print_history_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_print_history
    ADD CONSTRAINT sig_print_history_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.sig_packages(id) ON DELETE CASCADE;


--
-- Name: sig_signatures sig_signatures_sig_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sig_signatures
    ADD CONSTRAINT sig_signatures_sig_object_id_fkey FOREIGN KEY (sig_object_id) REFERENCES public.sig_objects(id) ON DELETE CASCADE;


--
-- Name: user_module_access user_module_access_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_access
    ADD CONSTRAINT "user_module_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_entrepriseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES public.entreprises(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workflow_actions workflow_actions_etapeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT "workflow_actions_etapeId_fkey" FOREIGN KEY ("etapeId") REFERENCES public.workflow_etapes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_actions workflow_actions_instanceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT "workflow_actions_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES public.workflow_instances(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_actions workflow_actions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT "workflow_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_etapes workflow_etapes_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_etapes
    ADD CONSTRAINT "workflow_etapes_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_instances workflow_instances_decompteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_decompteId_fkey" FOREIGN KEY ("decompteId") REFERENCES public.decomptes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workflow_instances workflow_instances_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_instances workflow_instances_marcheId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES public.marches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict diLQj3rqBM7NsgxyA5qDTBacfqiARJTspnLHpAdlZsrJj3aidHEWTlBgJmfzgOp

