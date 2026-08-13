/**
 * Module 14 — Notifications & Module 12 — SLA/Escalade
 */
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";

export async function notifyWorkflowStep(
  etape: { nom: string; roleRequis: string; slaDays: number },
  decompteRef: string,
  instanceId: string
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: etape.roleRequis as never, actif: true },
    select: { email: true, nomComplet: true },
  });
  for (const u of users) {
    await sendMail(
      u.email,
      `[ERP AGEROUTE] Action requise — ${decompteRef}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#1e3a5f;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">ERP AGEROUTE — Validation requise</h2>
        </div>
        <div style="padding:20px;border:1px solid #ddd;border-radius:0 0 8px 8px">
          <p>Bonjour <strong>${u.nomComplet}</strong>,</p>
          <p>Le décompte <strong>${decompteRef}</strong> est en attente de votre validation :</p>
          <div style="background:#f0f4ff;padding:12px;border-radius:6px;margin:16px 0">
            <strong>${etape.nom}</strong><br/><small>SLA : ${etape.slaDays} jours</small>
          </div>
          <a href="https://gestion.ageroute.gov.gn/workflow"
             style="background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
            Accéder à l'ERP
          </a>
          <p style="color:#888;font-size:12px;margin-top:16px">Réf. instance : ${instanceId}</p>
        </div>
      </div>`
    ).catch(() => {/* ne bloque pas si SMTP indisponible */});
  }
}

export async function verifierSlaEtEscalader(): Promise<{ escalades: number }> {
  const instancesEnCours = await prisma.workflowInstance.findMany({
    where: { statut: "EN_COURS" },
    include: {
      definition: { include: { etapes: { orderBy: { ordre: "asc" } } } },
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
      decompte: { select: { reference: true } },
    },
  });

  let escalades = 0;
  const maintenant = new Date();

  for (const instance of instancesEnCours) {
    const etape = instance.definition.etapes[instance.etapeActuelle];
    if (!etape) continue;
    const debut = instance.actions[0]?.createdAt ?? instance.createdAt;
    const joursEcoules = Math.floor((maintenant.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24));
    if (joursEcoules > etape.slaDays) {
      escalades++;
      const superieurs = await prisma.user.findMany({
        where: { role: { in: ["DG", "DAF", "ADMIN"] as never[] }, actif: true },
        select: { email: true, nomComplet: true },
      });
      for (const s of superieurs) {
        await sendMail(
          s.email,
          `[ALERTE SLA] Décompte ${instance.decompte?.reference} bloqué ${joursEcoules}j`,
          `<div style="font-family:sans-serif;max-width:600px;margin:auto">
            <div style="background:#c0392b;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">⚠️ Alerte SLA dépassé</h2>
            </div>
            <div style="padding:20px;border:1px solid #ddd">
              <p>Le décompte <strong>${instance.decompte?.reference}</strong> est bloqué depuis <strong>${joursEcoules} jours</strong>.</p>
              <p>Étape : <strong>${etape.nom}</strong> — rôle requis : ${etape.roleRequis}</p>
              <p>SLA : ${etape.slaDays}j — Dépassement : ${joursEcoules - etape.slaDays}j</p>
              <a href="https://gestion.ageroute.gov.gn/workflow"
                 style="background:#c0392b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
                Intervenir maintenant
              </a>
            </div>
          </div>`
        ).catch(() => {});
      }
    }
  }
  return { escalades };
}
