import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  tls: { rejectUnauthorized: false },
});

export async function sendMail(to: string | string[], subject: string, html: string): Promise<void> {
  if (!env.SMTP_HOST) return;
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
  } catch (err) {
    console.error("[MAILER] Envoi échoué:", (err as Error).message);
  }
}

// ─── Template générique workflow ──────────────────────────────────────────────

export function notifyWorkflow(to: string, etape: string, entite: string, lien: string) {
  return sendMail(
    to,
    `[ERP AGEROUTE] Action requise : ${etape}`,
    `<p>Bonjour,</p>
     <p>Une action est requise de votre part sur le dossier : <strong>${entite}</strong></p>
     <p>Étape : <strong>${etape}</strong></p>
     <p><a href="${lien}">Accéder au dossier</a></p>
     <p>— ERP AGEROUTE Guinée</p>`
  );
}

// ─── Templates BPMN étape par étape ──────────────────────────────────────────

const BASE = env.GEOPORTAIL_URL?.replace("carte", "gestion") ?? "https://gestion.ageroute.gov.gn";

const STYLE = `
  font-family: Arial, sans-serif; color: #1a1a1a;
  max-width: 600px; margin: 0 auto; padding: 20px;
`;
const HEADER = `
  <div style="background:#1B2A4A; padding:16px 20px; border-radius:8px 8px 0 0;">
    <img src="${BASE}/logo.png" alt="AGEROUTE" height="32" style="vertical-align:middle; margin-right:10px;">
    <span style="color:white; font-size:16px; font-weight:bold; vertical-align:middle;">ERP AGEROUTE Guinée</span>
  </div>
`;

/** Notifie le/les approbateur(s) de la prochaine étape */
export function notifyNextStep(opts: {
  to: string[];
  moduleType: string;
  entityRef: string;
  stepNom: string;
  roleRequis: string;
  soumetteurNom: string;
  commentairePrecedent?: string;
  entityId: string;
}) {
  const MODULE_LABELS: Record<string, string> = {
    PROJET: "Projet", MARCHE: "Marché", ATTACHEMENT: "Attachement",
    DECOMPTE: "Décompte", CONFORMITE: "Conformité entreprise",
  };
  const MODULE_PATHS: Record<string, string> = {
    PROJET: "projets", MARCHE: "marches", ATTACHEMENT: "attachements",
    DECOMPTE: "decomptes", CONFORMITE: "entreprises",
  };
  const label = MODULE_LABELS[opts.moduleType] ?? opts.moduleType;
  const path  = MODULE_PATHS[opts.moduleType] ?? "";
  const lien  = `${BASE}/${path}`;

  return sendMail(
    opts.to,
    `[ERP AGEROUTE] Action requise — ${label} ${opts.entityRef} · Étape : ${opts.stepNom}`,
    `<div style="${STYLE}">
      ${HEADER}
      <div style="background:#f9fafb; border:1px solid #e5e7eb; border-top:0; border-radius:0 0 8px 8px; padding:20px;">
        <h2 style="color:#1B2A4A; margin-top:0; font-size:18px;">Action requise — ${opts.stepNom}</h2>

        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
          <tr><td style="padding:6px 10px; background:#eff6ff; color:#3b82f6; font-weight:bold; border-radius:4px; width:40%">Module</td>
              <td style="padding:6px 10px;">${label}</td></tr>
          <tr><td style="padding:6px 10px; background:#f8fafc; color:#64748b; font-weight:bold;">Dossier</td>
              <td style="padding:6px 10px;"><strong>${opts.entityRef}</strong></td></tr>
          <tr><td style="padding:6px 10px; background:#f8fafc; color:#64748b; font-weight:bold;">Étape</td>
              <td style="padding:6px 10px; color:#1B2A4A; font-weight:bold;">${opts.stepNom}</td></tr>
          <tr><td style="padding:6px 10px; background:#f8fafc; color:#64748b; font-weight:bold;">Rôle requis</td>
              <td style="padding:6px 10px;">${opts.roleRequis}</td></tr>
          <tr><td style="padding:6px 10px; background:#f8fafc; color:#64748b; font-weight:bold;">Soumis par</td>
              <td style="padding:6px 10px;">${opts.soumetteurNom}</td></tr>
        </table>

        ${opts.commentairePrecedent ? `
        <div style="background:#fef9c3; border-left:4px solid #eab308; padding:10px 14px; border-radius:4px; margin-bottom:16px;">
          <strong>Note de l'étape précédente :</strong> ${opts.commentairePrecedent}
        </div>` : ""}

        <div style="text-align:center; margin:24px 0;">
          <a href="${lien}" style="background:#1B2A4A; color:white; padding:12px 28px; border-radius:6px;
             text-decoration:none; font-weight:bold; font-size:14px; display:inline-block;">
            ▶ Traiter le dossier dans l'ERP
          </a>
        </div>

        <p style="color:#6b7280; font-size:12px; border-top:1px solid #e5e7eb; padding-top:12px; margin-bottom:0;">
          Ce message est généré automatiquement par l'ERP AGEROUTE Guinée.<br>
          Ne pas répondre à cet email — traitez la demande directement dans l'application.
        </p>
      </div>
    </div>`
  );
}

/** Notifie le soumetteur d'un rejet ou demande de correction */
export function notifyDecision(opts: {
  to: string;
  moduleType: string;
  entityRef: string;
  decision: string;
  stepNom: string;
  decideurNom: string;
  commentaire: string;
  entityId: string;
}) {
  const DECISION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    REJETE:             { label: "Rejeté",              color: "#dc2626", bg: "#fef2f2" },
    DEMANDE_CORRECTION: { label: "Correction demandée", color: "#d97706", bg: "#fffbeb" },
    DEMANDE_COMPLEMENT: { label: "Complément requis",   color: "#2563eb", bg: "#eff6ff" },
    SUSPENDRE:          { label: "Suspendu",            color: "#7c3aed", bg: "#f5f3ff" },
    AUDIT:              { label: "Audit demandé",       color: "#374151", bg: "#f9fafb" },
  };
  const cfg = DECISION_LABELS[opts.decision] ?? { label: opts.decision, color: "#374151", bg: "#f9fafb" };
  const MODULE_LABELS: Record<string, string> = {
    PROJET: "Projet", MARCHE: "Marché", ATTACHEMENT: "Attachement",
    DECOMPTE: "Décompte", CONFORMITE: "Conformité entreprise",
  };
  const label = MODULE_LABELS[opts.moduleType] ?? opts.moduleType;

  return sendMail(
    opts.to,
    `[ERP AGEROUTE] ${cfg.label} — ${label} ${opts.entityRef}`,
    `<div style="${STYLE}">
      ${HEADER}
      <div style="background:#f9fafb; border:1px solid #e5e7eb; border-top:0; border-radius:0 0 8px 8px; padding:20px;">
        <div style="background:${cfg.bg}; border-left:4px solid ${cfg.color}; padding:12px 16px; border-radius:4px; margin-bottom:16px;">
          <p style="margin:0; color:${cfg.color}; font-weight:bold; font-size:16px;">${cfg.label}</p>
          <p style="margin:4px 0 0 0; color:#4b5563;">Étape : ${opts.stepNom} · Par : ${opts.decideurNom}</p>
        </div>

        <p><strong>Dossier :</strong> ${label} — ${opts.entityRef}</p>

        <div style="background:#f3f4f6; border-radius:6px; padding:12px 16px; margin:12px 0;">
          <strong>Motif / Commentaire :</strong><br>
          <span style="color:#374151;">${opts.commentaire}</span>
        </div>

        <p style="color:#6b7280; font-size:12px; border-top:1px solid #e5e7eb; padding-top:12px; margin-bottom:0;">
          Ce message est généré automatiquement par l'ERP AGEROUTE Guinée.
        </p>
      </div>
    </div>`
  );
}

/** Notifie d'une approbation finale (fin du circuit) */
export function notifyApprouve(opts: {
  to: string[];
  moduleType: string;
  entityRef: string;
  nbEtapes: number;
}) {
  const MODULE_LABELS: Record<string, string> = {
    PROJET: "Projet", MARCHE: "Marché", ATTACHEMENT: "Attachement",
    DECOMPTE: "Décompte", CONFORMITE: "Conformité entreprise",
  };
  const label = MODULE_LABELS[opts.moduleType] ?? opts.moduleType;

  return sendMail(
    opts.to,
    `[ERP AGEROUTE] ✅ Approuvé — ${label} ${opts.entityRef}`,
    `<div style="${STYLE}">
      ${HEADER}
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-top:0; border-radius:0 0 8px 8px; padding:20px; text-align:center;">
        <div style="font-size:48px; margin:12px 0;">✅</div>
        <h2 style="color:#15803d; margin:0 0 8px 0;">Circuit validé avec succès</h2>
        <p style="color:#374151;"><strong>${label}</strong> — ${opts.entityRef}</p>
        <p style="color:#6b7280; font-size:13px;">Validé en ${opts.nbEtapes} étape${opts.nbEtapes > 1 ? "s" : ""} — toutes les vérifications AGEROUTE sont complètes.</p>
        <p style="color:#6b7280; font-size:12px; border-top:1px solid #d1fae5; padding-top:12px; margin-bottom:0;">
          Ce message est généré automatiquement par l'ERP AGEROUTE Guinée.
        </p>
      </div>
    </div>`
  );
}
