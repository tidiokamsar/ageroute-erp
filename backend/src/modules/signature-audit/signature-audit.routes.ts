import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { ApiError } from "../../middleware/error.middleware";
import { logAudit } from "../../lib/audit";
import { bornerPagination, buildSignatureAuditWhere } from "./signature-audit.query";

export const signatureAuditRouter = Router();
signatureAuditRouter.use(requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────
type SigObject = {
  id: string; object_type: string; object_id: string; object_ref: string | null;
  title: string; current_version: number; status: string; created_by: string;
  created_at: Date; updated_at: Date;
};
type SigSignature = {
  id: string; sig_object_id: string; signer_user_id: string; signer_role: string;
  signer_nom: string | null; signature_method: string; signature_status: string;
  signed_at: Date | null; ip_address: string | null; user_agent: string | null;
  signature_hash: string | null; certificate_id: string | null;
  reason: string | null; attempt_count: number; created_at: Date; updated_at: Date;
};
type SigEvent = {
  id: string; sig_id: string; event_type: string; event_status: string;
  message: string | null; event_data: object | null; ip_address: string | null;
  user_id: string | null; created_at: Date;
};
type SigPackage = {
  id: string; sig_object_id: string; version: number; status: string;
  package_hash: string | null; certificate_data: object | null;
  qr_code: string | null; print_count: number; generated_at: Date | null;
  archived_at: Date | null; generated_by: string; created_at: Date; updated_at: Date;
};

const OBJECT_TYPES = ["MARCHE","DECOMPTE","PAIEMENT","RECEPTION","AVENANT","CONVENTION","DOCUMENT"] as const;
const METHODS = ["PASSWORD","OTP","CERTIFICAT","BIOMETRIQUE"] as const;

// Rôles pouvant signer selon le type de document
const SIGNATAIRES_AUTORISES: Record<string, string[]> = {
  MARCHE:      ["DG","DAF","ADMIN"],
  DECOMPTE:    ["DG","DAF","ADMIN"],
  PAIEMENT:    ["DAF","TRESOR","ADMIN"],
  RECEPTION:   ["DG","DMC","ADMIN","TECHNIQUE"],
  AVENANT:     ["DG","DAF","ADMIN"],
  CONVENTION:  ["DG","ADMIN"],
  DOCUMENT:    ["DG","DAF","DMC","ADMIN","MISSION","TECHNIQUE","UGP"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

function generateHash(objectId: string, userId: string, method: string, timestamp: string, version: number): string {
  const data = `${objectId}::${userId}::${method}::${timestamp}::v${version}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generatePackageHash(sigObjectId: string, certData: object, timestamp: string): string {
  const data = JSON.stringify({ sigObjectId, certData, timestamp });
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function getObjectRef(objectType: string, objectId: string): Promise<string> {
  try {
    if (objectType === "MARCHE") {
      const r = await prisma.$queryRaw<{reference:string}[]>`SELECT reference FROM marches WHERE id=${objectId} LIMIT 1`;
      return r[0]?.reference ?? objectId;
    }
    if (objectType === "DECOMPTE") {
      const r = await prisma.$queryRaw<{reference:string}[]>`SELECT reference FROM decomptes WHERE id=${objectId} LIMIT 1`;
      return r[0]?.reference ?? objectId;
    }
    if (objectType === "PAIEMENT") {
      const r = await prisma.$queryRaw<{reference:string}[]>`SELECT reference FROM paiements WHERE id=${objectId} LIMIT 1`;
      return r[0]?.reference ?? objectId;
    }
    if (objectType === "RECEPTION") {
      const r = await prisma.$queryRaw<{id:string}[]>`SELECT id FROM receptions WHERE id=${objectId} LIMIT 1`;
      return r[0] ? `RECEP-${objectId.slice(0,8)}` : objectId;
    }
  } catch (_) {}
  return objectId;
}

async function logSigEvent(sigId: string, eventType: string, status: string, message: string, data: object | null, ip: string, userId: string) {
  await prisma.$executeRaw`
    INSERT INTO sig_events (sig_id, event_type, event_status, message, event_data, ip_address, user_id)
    VALUES (${sigId}, ${eventType}, ${status}, ${message}, ${data ? JSON.stringify(data) as any : null}::jsonb, ${ip}, ${userId})
  `;
}

// ─── GET /api/signature-audit ─────────────────────────────────────────────────
signatureAuditRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, objectType } = req.query;
    // Entrées utilisateur bornées — requête paramétrée obligatoire (P3-11 REVUE).
    // Construction déportée dans signature-audit.query.ts pour être testée.
    const { limit, page, offset } = bornerPagination(req.query.pageSize, req.query.page);
    const whereClause = buildSignatureAuditWhere({ status, objectType });

    const rows = await prisma.$queryRaw<(SigObject & {
      signer_nom: string | null; signature_status: string | null; signed_at: Date | null;
    })[]>(Prisma.sql`
      SELECT so.*,
        u."nomComplet" as signer_nom,
        ss.signature_status,
        ss.signed_at
      FROM sig_objects so
      LEFT JOIN sig_signatures ss ON ss.sig_object_id = so.id
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ${whereClause}
      ORDER BY so.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = await prisma.$queryRaw<{count:string}[]>(
      Prisma.sql`SELECT COUNT(*)::text as count FROM sig_objects so WHERE ${whereClause}`
    );

    res.json({ data: rows, total: Number(total[0]?.count ?? 0), page, pageSize: limit });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit ────────────────────────────────────────────────
signatureAuditRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { objectType, objectId, title, signerUserId, signerRole, method = "PASSWORD" } = z.object({
      objectType:    z.enum(OBJECT_TYPES),
      objectId:      z.string().min(1),
      title:         z.string().min(3),
      signerUserId:  z.string().uuid().optional(),
      signerRole:    z.string().optional(),
      method:        z.enum(METHODS).optional(),
    }).parse(req.body);

    const ref = await getObjectRef(objectType, objectId);

    const existing = await prisma.$queryRaw<SigObject[]>`
      SELECT * FROM sig_objects WHERE object_type=${objectType} AND object_id=${objectId} AND status NOT IN ('signed','rejected','cancelled','archived') LIMIT 1
    `;
    if (existing.length > 0) throw new ApiError(409, "Une demande de signature est déjà en cours pour ce document");

    const [obj] = await prisma.$queryRaw<SigObject[]>`
      INSERT INTO sig_objects (object_type, object_id, object_ref, title, created_by)
      VALUES (${objectType}, ${objectId}, ${ref}, ${title}, ${req.user.id})
      RETURNING *
    `;

    // Créer la signature si signataire spécifié
    let sig: SigSignature | null = null;
    if (signerUserId || signerRole) {
      const targetUserId = signerUserId ?? req.user.id;
      // Le rôle du signataire est DÉRIVÉ DU SERVEUR, jamais du corps de la
      // requête. L'ancienne version acceptait `signerRole` tel que fourni par le
      // client : n'importe quel appelant pouvait attribuer une signature « DG »
      // à un compte qui ne l'est pas — attribution d'autorité falsifiable,
      // constat bloquant de la revue du 22/08/2026 et principe n°5 de l'audit
      // signature. `signerRole` reste accepté pour compatibilité, mais il est
      // ignoré : seul le rôle enregistré du compte désigné fait foi.
      const signerUser = await prisma.user.findFirst({ where: { id: targetUserId, actif: true }, select: { nomComplet: true, role: true } });
      if (!signerUser) throw new ApiError(404, "Signataire introuvable ou inactif");
      const targetRole = signerUser.role;
      if (signerRole && signerRole !== targetRole) {
        await logAudit({ userId: req.user.id, action: "REJECT", entityType: "SignatureObject", entityId: obj.id,
          after: { motif: "roleClientIgnore", roleDemande: signerRole, roleRetenu: targetRole, signataire: targetUserId } });
      }

      [sig] = await prisma.$queryRaw<SigSignature[]>`
        INSERT INTO sig_signatures (sig_object_id, signer_user_id, signer_role, signer_nom, signature_method)
        VALUES (${obj.id}, ${targetUserId}, ${targetRole}, ${signerUser?.nomComplet ?? null}, ${method ?? "PASSWORD"})
        RETURNING *
      `;

      await logSigEvent(sig.id, "CREATED", "pending",
        `Demande de signature créée pour ${signerUser?.nomComplet ?? targetRole}`,
        { objectType, objectId, ref }, getIp(req), req.user.id);
    }

    await logAudit({ userId: req.user.id, action: "CREATE", entityType: "SignatureObject", entityId: obj.id,
      after: { objectType, objectId, ref, title } });

    res.status(201).json({ sigObject: obj, signature: sig });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/:id ────────────────────────────────────────────
signatureAuditRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet de signature introuvable");

    const signatures = await prisma.$queryRaw<(SigSignature & { nomComplet: string | null })[]>`
      SELECT ss.*, u."nomComplet"
      FROM sig_signatures ss
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY ss.created_at ASC
    `;

    const events = await prisma.$queryRaw<SigEvent[]>`
      SELECT se.*, u."nomComplet" as user_nom
      FROM sig_events se
      LEFT JOIN users u ON u.id = se.user_id
      WHERE se.sig_id IN (SELECT id FROM sig_signatures WHERE sig_object_id=${req.params.id})
      ORDER BY se.created_at DESC
      LIMIT 50
    `;

    const attempts = await prisma.$queryRaw<any[]>`
      SELECT sa.*, u."nomComplet" as user_nom
      FROM sig_attempts sa
      LEFT JOIN sig_signatures ss ON ss.id = sa.sig_id
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY sa.created_at DESC
      LIMIT 20
    `;

    const pkg = await prisma.$queryRaw<SigPackage[]>`
      SELECT * FROM sig_packages WHERE sig_object_id=${req.params.id} ORDER BY version DESC LIMIT 1
    `;

    res.json({ sigObject: obj, signatures, events, attempts, package: pkg[0] ?? null });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/start ─────────────────────────────────────
signatureAuditRouter.post("/:id/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");
    if (["signed","archived","cancelled"].includes(obj.status)) throw new ApiError(400, `Document déjà ${obj.status} — impossible de démarrer une signature`);

    // Vérification du rôle
    const autorises = SIGNATAIRES_AUTORISES[obj.object_type] ?? [];
    if (!autorises.includes(req.user.role) && req.user.role !== "ADMIN") {
      await prisma.$executeRaw`
        INSERT INTO sig_attempts (sig_id, attempt_no, result, failure_reason, ip_address)
        SELECT id, attempt_count+1, 'BLOCKED', 'Rôle non autorisé: '||${req.user.role}, ${getIp(req)}
        FROM sig_signatures WHERE sig_object_id=${req.params.id} AND signer_user_id=${req.user.id} LIMIT 1
      `.catch(() => {});
      throw new ApiError(403, `Rôle '${req.user.role}' non autorisé à signer ce type de document (${obj.object_type})`);
    }

    // Trouver ou créer la signature
    let [sig] = await prisma.$queryRaw<SigSignature[]>`
      SELECT * FROM sig_signatures WHERE sig_object_id=${req.params.id} AND signer_user_id=${req.user.id} AND signature_status NOT IN ('signed','rejected') LIMIT 1
    `;

    if (!sig) {
      // Créer la signature pour ce signataire
      const signerUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { nomComplet: true } });
      [sig] = await prisma.$queryRaw<SigSignature[]>`
        INSERT INTO sig_signatures (sig_object_id, signer_user_id, signer_role, signer_nom, signature_method, signature_status)
        VALUES (${req.params.id}, ${req.user.id}, ${req.user.role}, ${signerUser?.nomComplet ?? null}, 'PASSWORD', 'in_progress')
        RETURNING *
      `;
    } else {
      await prisma.$executeRaw`UPDATE sig_signatures SET signature_status='in_progress', updated_at=NOW() WHERE id=${sig.id}`;
    }

    // Mettre à jour l'objet
    await prisma.$executeRaw`UPDATE sig_objects SET status='in_progress', updated_at=NOW() WHERE id=${req.params.id}`;

    await logSigEvent(sig.id, "OPENED", "in_progress", "Document ouvert pour signature", null, getIp(req), req.user.id);

    res.json({ signature: sig, message: "Session de signature démarrée — présentez vos credentials pour confirmer" });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/confirm ───────────────────────────────────
signatureAuditRouter.post("/:id/confirm", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");

    const { password, commentaire, luEtApprouve } = z.object({
      password:     z.string().min(1, "Mot de passe requis pour confirmer la signature"),
      commentaire:  z.string().optional(),
      luEtApprouve: z.boolean().optional(),
    }).parse(req.body);

    if (!luEtApprouve) throw new ApiError(400, "Vous devez confirmer avoir lu le document avant de signer");

    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");
    if (obj.status === "signed") throw new ApiError(400, "Document déjà signé");
    if (["cancelled","archived"].includes(obj.status)) throw new ApiError(400, `Document ${obj.status}`);

    const [sig] = await prisma.$queryRaw<SigSignature[]>`
      SELECT * FROM sig_signatures WHERE sig_object_id=${req.params.id} AND signer_user_id=${req.user.id} AND signature_status NOT IN ('signed','rejected') LIMIT 1
    `;
    if (!sig) throw new ApiError(404, "Aucune session de signature active pour cet utilisateur");

    // Vérifier le mot de passe via bcrypt
    const bcrypt = await import("bcryptjs");
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
    if (!userRecord) throw new ApiError(404, "Utilisateur introuvable");

    const pwOk = await bcrypt.compare(password, userRecord.passwordHash);

    // Enregistrer la tentative
    const attemptNo = (sig.attempt_count ?? 0) + 1;
    await prisma.$executeRaw`
      UPDATE sig_signatures SET attempt_count=${attemptNo}, updated_at=NOW() WHERE id=${sig.id}
    `;

    if (!pwOk) {
      await prisma.$executeRaw`
        INSERT INTO sig_attempts (sig_id, attempt_no, result, failure_reason, ip_address)
        VALUES (${sig.id}, ${attemptNo}, 'FAILED', 'Mot de passe incorrect', ${getIp(req)})
      `;
      await logSigEvent(sig.id, "AUTH_FAILED", "failed", "Authentification échouée — mot de passe incorrect",
        { attempt: attemptNo }, getIp(req), req.user.id);

      if (attemptNo >= 5) {
        await prisma.$executeRaw`UPDATE sig_signatures SET signature_status='cancelled', updated_at=NOW() WHERE id=${sig.id}`;
        await logSigEvent(sig.id, "CANCELLED", "cancelled", "Session bloquée après 5 tentatives échouées", null, getIp(req), req.user.id);
        throw new ApiError(403, "Session bloquée après 5 tentatives échouées");
      }
      throw new ApiError(401, `Authentification échouée (tentative ${attemptNo}/5)`);
    }

    // ✅ Authentification réussie — générer la signature
    const now = new Date();
    const hash = generateHash(obj.object_id, req.user.id, sig.signature_method, now.toISOString(), obj.current_version);
    const certId = `CERT-${obj.object_type}-${now.getTime()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    await prisma.$executeRaw`
      UPDATE sig_signatures SET
        signature_status='signed', signed_at=${now}, ip_address=${getIp(req)},
        user_agent=${req.headers["user-agent"] ?? null},
        signature_hash=${hash}, certificate_id=${certId},
        reason=${commentaire ?? null}, updated_at=NOW()
      WHERE id=${sig.id}
    `;

    await prisma.$executeRaw`
      INSERT INTO sig_attempts (sig_id, attempt_no, result, ip_address)
      VALUES (${sig.id}, ${attemptNo}, 'SUCCESS', ${getIp(req)})
    `;

    // Mettre à jour le statut de l'objet
    await prisma.$executeRaw`UPDATE sig_objects SET status='signed', updated_at=NOW() WHERE id=${req.params.id}`;

    await logSigEvent(sig.id, "SIGNED", "signed",
      `Document signé par ${req.user.email} — méthode ${sig.signature_method}`,
      { hash: hash.slice(0, 16) + "...", certId, ip: getIp(req) }, getIp(req), req.user.id);

    await logAudit({ userId: req.user.id, action: "APPROVE", entityType: "SignatureObject", entityId: obj.id,
      after: { status: "signed", certId, hash: hash.slice(0, 16) } });

    res.json({
      message: "Document signé avec succès",
      signature: { id: sig.id, status: "signed", signed_at: now, certificate_id: certId, hash: hash.slice(0, 16) + "..." },
      sigObject: { ...obj, status: "signed" },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/reject ────────────────────────────────────
signatureAuditRouter.post("/:id/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { reason, password } = z.object({
      reason:   z.string().min(10, "Motif de refus obligatoire (min 10 caractères)"),
      password: z.string().min(1),
    }).parse(req.body);

    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");
    if (["signed","cancelled","archived"].includes(obj.status)) throw new ApiError(400, `Document ${obj.status} — impossible de refuser`);

    const bcrypt = await import("bcryptjs");
    const userRecord = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
    const pwOk = userRecord ? await bcrypt.compare(password, userRecord.passwordHash) : false;
    if (!pwOk) throw new ApiError(401, "Authentification échouée — mot de passe incorrect");

    const [sig] = await prisma.$queryRaw<SigSignature[]>`
      SELECT * FROM sig_signatures WHERE sig_object_id=${req.params.id} AND signer_user_id=${req.user.id} AND signature_status NOT IN ('signed','rejected') LIMIT 1
    `;
    if (!sig) throw new ApiError(404, "Aucune session de signature active");

    await prisma.$executeRaw`
      UPDATE sig_signatures SET
        signature_status='rejected', reason=${reason}, updated_at=NOW(),
        ip_address=${getIp(req)}, signed_at=NOW()
      WHERE id=${sig.id}
    `;
    await prisma.$executeRaw`UPDATE sig_objects SET status='rejected', updated_at=NOW() WHERE id=${req.params.id}`;

    await logSigEvent(sig.id, "REJECTED", "rejected",
      `Document refusé par ${req.user.email} — motif: ${reason}`,
      { reason, ip: getIp(req) }, getIp(req), req.user.id);

    await logAudit({ userId: req.user.id, action: "REJECT", entityType: "SignatureObject", entityId: obj.id,
      after: { status: "rejected", reason } });

    res.json({ message: "Refus enregistré et tracé", status: "rejected", reason });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/:id/events ─────────────────────────────────────
signatureAuditRouter.get("/:id/events", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await prisma.$queryRaw<any[]>`
      SELECT se.*, u."nomComplet" as user_nom, ss.signer_role
      FROM sig_events se
      LEFT JOIN sig_signatures ss ON ss.id = se.sig_id
      LEFT JOIN users u ON u.id = se.user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY se.created_at ASC
    `;
    res.json(events);
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/:id/audit-trail ────────────────────────────────
signatureAuditRouter.get("/:id/audit-trail", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");

    const signatures = await prisma.$queryRaw<any[]>`
      SELECT ss.*, u."nomComplet", u.email
      FROM sig_signatures ss
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id}
    `;
    const events = await prisma.$queryRaw<any[]>`
      SELECT se.*, u."nomComplet" as user_nom
      FROM sig_events se
      LEFT JOIN sig_signatures ss ON ss.id = se.sig_id
      LEFT JOIN users u ON u.id = se.user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY se.created_at ASC
    `;
    const attempts = await prisma.$queryRaw<any[]>`
      SELECT sa.*, ss.signer_role, u."nomComplet" as user_nom
      FROM sig_attempts sa
      LEFT JOIN sig_signatures ss ON ss.id = sa.sig_id
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY sa.created_at ASC
    `;

    res.json({ sigObject: obj, signatures, events, attempts, generatedAt: new Date() });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/:id/download ───────────────────────────────────
signatureAuditRouter.get("/:id/download", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");

    const signatures = await prisma.$queryRaw<any[]>`
      SELECT ss.*, u."nomComplet", u.email
      FROM sig_signatures ss
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id}
    `;
    const events = await prisma.$queryRaw<any[]>`
      SELECT se.*, u."nomComplet" as user_nom
      FROM sig_events se
      LEFT JOIN sig_signatures ss ON ss.id = se.sig_id
      LEFT JOIN users u ON u.id = se.user_id
      WHERE ss.sig_object_id=${req.params.id}
      ORDER BY se.created_at ASC
    `;

    const signedSig = signatures.find(s => s.signature_status === "signed");

    // Génération du certificat de preuve
    const certificate = {
      CERTIFICAT_DE_SIGNATURE: "AGEROUTE — ERP Gestion",
      version: "1.0",
      objet: {
        id: obj.id,
        type: obj.object_type,
        reference: obj.object_ref ?? obj.object_id,
        titre: obj.title,
        version_document: obj.current_version,
        statut_final: obj.status,
      },
      signature: signedSig ? {
        signataire: signedSig.nomComplet ?? signedSig.email,
        role: signedSig.signer_role,
        email: signedSig.email,
        methode: signedSig.signature_method,
        date_heure: signedSig.signed_at,
        ip_adresse: signedSig.ip_address,
        empreinte_sha256: signedSig.signature_hash,
        certificat_id: signedSig.certificate_id,
      } : null,
      journal_evenements: events.map(e => ({
        type: e.event_type,
        statut: e.event_status,
        message: e.message,
        date_heure: e.created_at,
        acteur: e.user_nom ?? "Système",
        ip: e.ip_address,
      })),
      meta: {
        genere_par: "ERP AGEROUTE",
        genere_le: new Date().toISOString(),
        url_verification: `https://gestion.ageroute.gov.gn/signatures/${obj.id}`,
        avertissement: "Ce certificat est généré automatiquement. Toute altération invalide sa valeur probante.",
      },
    };

    const json = JSON.stringify(certificate, null, 2);
    const filename = `certificat_signature_${obj.object_type}_${obj.object_ref ?? obj.id}_${new Date().toISOString().split("T")[0]}.json`;

    // Journaliser le téléchargement
    if (signedSig) {
      await logSigEvent(signedSig.id, "ARCHIVED", "archived", `Certificat téléchargé par ${req.user?.email}`,
        { filename }, getIp(req), req.user?.id ?? "unknown").catch(() => {});
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/package ───────────────────────────────────
signatureAuditRouter.post("/:id/package", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const [obj] = await prisma.$queryRaw<SigObject[]>`SELECT * FROM sig_objects WHERE id=${req.params.id}`;
    if (!obj) throw new ApiError(404, "Objet introuvable");
    if (obj.status !== "signed") throw new ApiError(400, "Le document doit être signé avant de générer un paquet");

    const signatures = await prisma.$queryRaw<any[]>`
      SELECT ss.*, u."nomComplet", u.email
      FROM sig_signatures ss LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE ss.sig_object_id=${req.params.id} AND ss.signature_status='signed'
    `;
    if (signatures.length === 0) throw new ApiError(400, "Aucune signature validée trouvée");

    // Vérifier si un paquet existe déjà
    const [existingPkg] = await prisma.$queryRaw<SigPackage[]>`
      SELECT * FROM sig_packages WHERE sig_object_id=${req.params.id} AND status NOT IN ('invalidated','cancelled') ORDER BY version DESC LIMIT 1
    `;

    const nextVersion = existingPkg ? existingPkg.version + 1 : 1;
    if (existingPkg) {
      await prisma.$executeRaw`UPDATE sig_packages SET status='invalidated', updated_at=NOW() WHERE id=${existingPkg.id}`;
    }

    const now = new Date();
    const certData = {
      sigObject: obj,
      signatures: signatures.map(s => ({
        signataire: s.nomComplet, role: s.signer_role, email: s.email,
        methode: s.signature_method, date: s.signed_at, ip: s.ip_address,
        hash: s.signature_hash, certId: s.certificate_id,
      })),
      generatedAt: now.toISOString(),
      version: nextVersion,
    };

    const pkgHash = generatePackageHash(obj.id, certData, now.toISOString());
    const qrCode = `https://gestion.ageroute.gov.gn/verif/${pkgHash.slice(0, 16)}`;

    const [pkg] = await prisma.$queryRaw<SigPackage[]>`
      INSERT INTO sig_packages (sig_object_id, version, status, package_hash, certificate_data, qr_code, generated_at, generated_by)
      VALUES (${obj.id}, ${nextVersion}, 'generated', ${pkgHash}, ${JSON.stringify(certData) as any}::jsonb, ${qrCode}, ${now}, ${req.user.id})
      RETURNING *
    `;

    await prisma.$executeRaw`UPDATE sig_packages SET status='ready_to_print', updated_at=NOW() WHERE id=${pkg.id}`;

    // Log pour chaque signature
    for (const sig of signatures) {
      await logSigEvent(sig.id, "PACKAGE_GENERATED", "generated",
        `Paquet v${nextVersion} généré — hash: ${pkgHash.slice(0,16)}...`,
        { packageId: pkg.id, version: nextVersion }, getIp(req), req.user.id).catch(() => {});
    }

    res.status(201).json({
      package: { ...pkg, status: "ready_to_print" },
      message: `Paquet documentaire v${nextVersion} généré — prêt pour impression`,
      verificationUrl: qrCode,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/:id/package ────────────────────────────────────
signatureAuditRouter.get("/:id/package", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const packages = await prisma.$queryRaw<(SigPackage & {operator_nom:string|null})[]>`
      SELECT sp.*, u."nomComplet" as operator_nom
      FROM sig_packages sp LEFT JOIN users u ON u.id = sp.generated_by
      WHERE sp.sig_object_id=${req.params.id}
      ORDER BY sp.version DESC
    `;
    const printHistory = packages.length > 0 ? await prisma.$queryRaw<any[]>`
      SELECT sph.*, u."nomComplet" as operator_nom
      FROM sig_print_history sph LEFT JOIN users u ON u.id = sph.operator_id
      WHERE sph.package_id IN (SELECT id FROM sig_packages WHERE sig_object_id=${req.params.id})
      ORDER BY sph.created_at DESC
    ` : [];
    res.json({ packages, printHistory });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/package/print ─────────────────────────────
signatureAuditRouter.post("/:id/package/print", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const { copies = 1, printerName, recipient, motif } = z.object({
      copies:      z.number().min(1).max(10).optional(),
      printerName: z.string().optional(),
      recipient:   z.string().optional(),
      motif:       z.string().optional(),
    }).parse(req.body);

    const [pkg] = await prisma.$queryRaw<SigPackage[]>`
      SELECT * FROM sig_packages WHERE sig_object_id=${req.params.id} AND status IN ('ready_to_print','printed','reprinted') ORDER BY version DESC LIMIT 1
    `;
    if (!pkg) throw new ApiError(400, "Aucun paquet prêt pour l'impression");

    const printNo = (pkg.print_count ?? 0) + 1;
    const isReprint = printNo > 1;

    if (isReprint && !motif) throw new ApiError(400, "Motif de réimpression obligatoire");

    await prisma.$executeRaw`
      INSERT INTO sig_print_history (package_id, print_no, copies, printer_name, recipient, operator_id, motif, ip_address)
      VALUES (${pkg.id}, ${printNo}, ${copies ?? 1}, ${printerName ?? null}, ${recipient ?? null}, ${req.user.id}, ${motif ?? null}, ${getIp(req)})
    `;

    await prisma.$executeRaw`
      UPDATE sig_packages SET
        status=${isReprint ? "reprinted" : "printed"},
        print_count=${printNo},
        updated_at=NOW()
      WHERE id=${pkg.id}
    `;

    // Log
    const sigs = await prisma.$queryRaw<{id:string}[]>`SELECT id FROM sig_signatures WHERE sig_object_id=${req.params.id} LIMIT 1`;
    if (sigs[0]) {
      await logSigEvent(sigs[0].id, "PRINTED", "printed",
        `${isReprint ? "Réimpression" : "Impression"} n°${printNo} — ${copies} copie(s) — ${recipient ?? "destinataire inconnu"}`,
        { printNo, copies, printerName, motif }, getIp(req), req.user.id).catch(() => {});
    }

    res.json({ message: `${isReprint ? "Réimpression" : "Impression"} n°${printNo} enregistrée`, printNo, copies });
  } catch (err) { next(err); }
});

// ─── POST /api/signature-audit/:id/package/archive ───────────────────────────
signatureAuditRouter.post("/:id/package/archive", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, "Non authentifié");
    const [pkg] = await prisma.$queryRaw<SigPackage[]>`
      SELECT * FROM sig_packages WHERE sig_object_id=${req.params.id} AND status NOT IN ('archived','invalidated','cancelled') ORDER BY version DESC LIMIT 1
    `;
    if (!pkg) throw new ApiError(400, "Aucun paquet disponible pour l'archivage");

    await prisma.$executeRaw`
      UPDATE sig_packages SET status='archived', archived_at=NOW(), updated_at=NOW() WHERE id=${pkg.id}
    `;
    await prisma.$executeRaw`UPDATE sig_objects SET status='archived', updated_at=NOW() WHERE id=${req.params.id}`;

    await logAudit({ userId: req.user.id, action: "UPDATE", entityType: "SigPackage", entityId: pkg.id });

    res.json({ message: "Paquet archivé — dossier clos", status: "archived" });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/journal/securite ───────────────────────────────
signatureAuditRouter.get("/journal/securite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = "1", pageSize = "30" } = req.query;
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const failed = await prisma.$queryRaw<any[]>`
      SELECT sa.*, ss.signer_role, so.object_type, so.object_ref,
             u."nomComplet" as user_nom, u.email as user_email
      FROM sig_attempts sa
      JOIN sig_signatures ss ON ss.id = sa.sig_id
      JOIN sig_objects so ON so.id = ss.sig_object_id
      LEFT JOIN users u ON u.id = ss.signer_user_id
      WHERE sa.result IN ('FAILED','BLOCKED')
      ORDER BY sa.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const stats = await prisma.$queryRaw<any[]>`
      SELECT result, COUNT(*)::int as total
      FROM sig_attempts GROUP BY result
    `;

    res.json({ attempts: failed, stats, page: Number(page), pageSize: limit });
  } catch (err) { next(err); }
});

// ─── GET /api/signature-audit/stats ──────────────────────────────────────────
signatureAuditRouter.get("/stats/global", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await prisma.$queryRaw<any[]>`
      SELECT status, COUNT(*)::int as total FROM sig_objects GROUP BY status
    `;
    const byType = await prisma.$queryRaw<any[]>`
      SELECT object_type, COUNT(*)::int as total FROM sig_objects GROUP BY object_type ORDER BY total DESC
    `;
    const recent = await prisma.$queryRaw<any[]>`
      SELECT so.*, ss.signer_nom, ss.signature_status, ss.signed_at
      FROM sig_objects so
      LEFT JOIN sig_signatures ss ON ss.sig_object_id = so.id
      ORDER BY so.updated_at DESC LIMIT 5
    `;
    res.json({ byStatus: stats, byType, recent });
  } catch (err) { next(err); }
});
