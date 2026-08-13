import { fmtGnf } from "./api";

// ─── Bordereau de validation imprimable (circuit papier // circuit numérique) ──
export function imprimerBordereau(det: Record<string, unknown>, v: Record<string, unknown>) {
  const marche = det.marche as Record<string, unknown> | undefined;
  const entreprise = det.entreprise as Record<string, unknown> | undefined;
  const fdate = (x: unknown) => x ? new Date(x as string).toLocaleString("fr-FR") : "—";
  const decision = String(v.decision ?? "");
  const decColor = decision === "APPROUVE" ? "#16a34a" : decision === "REJETE" ? "#dc2626" : "#d97706";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Bordereau — ${det.reference}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      td{border:1px solid #d1d5db;padding:6px 10px}
      .lbl{background:#f3f4f6;font-weight:bold;width:32%}
      @media print{button{display:none}}</style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <h1 style="margin:0;font-size:17px;color:#1B2A4A">AGEROUTE GUINÉE</h1>
        <p style="margin:2px 0;font-size:11px;color:#6b7280">Direction des Marchés et Contrats — Circuit de validation e-Décompte</p>
      </div>
      <div style="text-align:right;font-size:11px;color:#6b7280">
        <p style="margin:0">Imprimé le ${new Date().toLocaleString("fr-FR")}</p>
        <p style="margin:0">Dossier n° ${det.numeroDossier ?? "—"}</p>
      </div>
    </div>
    <h2 style="background:#1B2A4A;color:#fff;padding:8px 12px;font-size:14px;margin:0 0 14px">
      BORDEREAU DE VALIDATION — ÉTAPE ${v.etape}
    </h2>
    <table>
      <tr><td class="lbl">Décompte</td><td style="font-family:monospace;font-weight:bold">${det.reference}</td></tr>
      <tr><td class="lbl">Marché</td><td>${marche?.reference ?? "—"} — ${marche?.intitule ?? ""}</td></tr>
      <tr><td class="lbl">Entreprise</td><td>${entreprise?.raisonSociale ?? "—"}</td></tr>
      <tr><td class="lbl">Net à payer</td><td style="font-weight:bold">${fmtGnf(String(det.netAPayer ?? "0"))}</td></tr>
      <tr><td class="lbl">Statut du dossier</td><td>${det.statut}</td></tr>
    </table>
    <table>
      <tr><td class="lbl">Étape du circuit</td><td style="font-weight:bold">${v.etape}</td></tr>
      <tr><td class="lbl">Décision</td><td style="font-weight:bold;color:${decColor}">${decision}</td></tr>
      <tr><td class="lbl">Validé par</td><td>${v.valideNom ?? v.validePar ?? "—"} (${v.valideRole ?? "—"})</td></tr>
      <tr><td class="lbl">Date / heure</td><td>${fdate(v.valideAt)}</td></tr>
      ${v.signatureRef ? `<tr><td class="lbl">Réf. signature électronique</td><td style="font-family:monospace">${v.signatureRef}</td></tr>` : ""}
      <tr><td class="lbl">Avis / Commentaire</td><td>${v.commentaire ?? "—"}</td></tr>
    </table>
    <p style="font-size:10px;color:#6b7280;margin:16px 0 30px">
      Le présent bordereau accompagne le dossier physique du décompte. Il atteste que l'étape ci-dessus a été
      traitée dans le système e-Décompte AGEROUTE et fait foi pour la transmission au service suivant.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;margin-top:46px">
      <div><div style="border-top:1px solid #111;padding-top:6px">Transmis par (nom, date, signature)</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">Reçu par (nom, date, signature)</div></div>
    </div>
    <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#1B2A4A;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">Imprimer</button>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}


// ─── Fiche d'analyse technique — élaborée au visa de la Direction Technique ────
export function imprimerFicheAnalyse(det: Record<string, unknown>, validations: Array<Record<string, unknown>>) {
  const marche = det.marche as Record<string, unknown> | undefined;
  const entreprise = det.entreprise as Record<string, unknown> | undefined;
  const g = (k: string) => fmtGnf(String(det[k] ?? "0"));
  const avis = (etape: string) => {
    const v = validations.filter((x) => x.etape === etape && x.decision !== "RECEPTION").slice(0, 1)[0];
    return v ? `${v.decision} — ${v.commentaire ?? ""} (${v.valideNom ?? ""}, ${v.valideAt ? new Date(v.valideAt as string).toLocaleDateString("fr-FR") : ""})` : "En attente";
  };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche d'analyse — ${det.reference}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      td{border:1px solid #d1d5db;padding:6px 10px}
      .lbl{background:#f3f4f6;font-weight:bold;width:38%}
      .num{text-align:right;font-family:monospace}
      @media print{button{display:none}}</style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <div><h1 style="margin:0;font-size:17px;color:#1B2A4A">AGEROUTE GUINÉE</h1>
      <p style="margin:2px 0;font-size:11px;color:#6b7280">Direction Technique — Fiche d'analyse du décompte</p></div>
      <div style="text-align:right;font-size:11px;color:#6b7280">Dossier n° ${det.numeroDossier ?? "—"}<br/>${new Date().toLocaleDateString("fr-FR")}</div>
    </div>
    <h2 style="background:#1B2A4A;color:#fff;padding:8px 12px;font-size:14px;margin:0 0 14px">FICHE D'ANALYSE — ${det.reference}</h2>
    <table>
      <tr><td class="lbl">Marché</td><td>${marche?.reference ?? "—"} — ${marche?.intitule ?? ""}</td></tr>
      <tr><td class="lbl">Entreprise</td><td>${entreprise?.raisonSociale ?? "—"}</td></tr>
      <tr><td class="lbl">Type / Statut</td><td>${det.type} / ${det.statut}</td></tr>
      <tr><td class="lbl">Période</td><td>${det.periodeDebut ? new Date(det.periodeDebut as string).toLocaleDateString("fr-FR") : "—"} → ${det.periodeFin ? new Date(det.periodeFin as string).toLocaleDateString("fr-FR") : "—"}</td></tr>
    </table>
    <h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">DÉCOMPOSITION FINANCIÈRE</h3>
    <table>
      <tr><td class="lbl">Montant HT période</td><td class="num">${g("montantPeriodeHtGnf")}</td></tr>
      <tr><td class="lbl">Cumul antérieur HT</td><td class="num">${g("cumulPrecedentHtGnf")}</td></tr>
      <tr><td class="lbl">Cumul actuel HT</td><td class="num">${g("cumulActuelHtGnf")}</td></tr>
      <tr><td class="lbl">TVA (18 %)</td><td class="num">+ ${g("tva")}</td></tr>
      <tr><td class="lbl">Redevance ARMP (0,6 %)</td><td class="num">+ ${g("montantArmpGnf")}</td></tr>
      <tr><td class="lbl">Montant TTC</td><td class="num" style="font-weight:bold">${g("montantTtcGnf")}</td></tr>
      <tr><td class="lbl">Précompte TVA (9/118)</td><td class="num">− ${g("precompteTvaGnf")}</td></tr>
      <tr><td class="lbl">Retenue de garantie (5 %)</td><td class="num">− ${g("retenueGarantie")}</td></tr>
      <tr><td class="lbl">Récupération avance</td><td class="num">− ${g("avanceRecuperee")}</td></tr>
      <tr><td class="lbl">Pénalités</td><td class="num">− ${g("penalites")}</td></tr>
      <tr><td class="lbl">Révision de prix</td><td class="num">+ ${g("revisionPrix")}</td></tr>
      <tr><td class="lbl" style="font-size:13px">NET À PAYER</td><td class="num" style="font-weight:bold;font-size:14px;color:#1B2A4A">${g("netAPayer")}</td></tr>
    </table>
    <h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">AVIS DU CIRCUIT DE CONTRÔLE</h3>
    <table>
      <tr><td class="lbl">Mission de contrôle</td><td>${avis("MISSION")}</td></tr>
      <tr><td class="lbl">Direction Technique</td><td>${avis("TECHNIQUE")}</td></tr>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;margin-top:50px">
      <div><div style="border-top:1px solid #111;padding-top:6px">Mission de Contrôle<br/>(nom, date, signature)</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">Direction Technique<br/>(nom, date, signature)</div></div>
    </div>
    <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#1B2A4A;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">Imprimer</button>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html); win.document.close();
  setTimeout(() => win.print(), 500);
}

// ─── Bordereau de paiement — produit pour la DAF / le DG ──────────────────────
export function imprimerBordereauPaiement(det: Record<string, unknown>) {
  const marche = det.marche as Record<string, unknown> | undefined;
  const entreprise = det.entreprise as Record<string, unknown> | undefined;
  const g = (k: string) => fmtGnf(String(det[k] ?? "0"));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bordereau de paiement — ${det.reference}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      td{border:1px solid #d1d5db;padding:6px 10px}
      .lbl{background:#f3f4f6;font-weight:bold;width:38%}
      .num{text-align:right;font-family:monospace}
      @media print{button{display:none}}</style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <div><h1 style="margin:0;font-size:17px;color:#1B2A4A">AGEROUTE GUINÉE</h1>
      <p style="margin:2px 0;font-size:11px;color:#6b7280">Direction Administrative et Financière</p></div>
      <div style="text-align:right;font-size:11px;color:#6b7280">Dossier n° ${det.numeroDossier ?? "—"}<br/>${new Date().toLocaleDateString("fr-FR")}</div>
    </div>
    <h2 style="background:#166534;color:#fff;padding:8px 12px;font-size:14px;margin:0 0 14px">BORDEREAU DE PAIEMENT — ${det.reference}</h2>
    <table>
      <tr><td class="lbl">Bénéficiaire</td><td style="font-weight:bold">${entreprise?.raisonSociale ?? "—"}</td></tr>
      <tr><td class="lbl">Marché</td><td>${marche?.reference ?? "—"} — ${marche?.intitule ?? ""}</td></tr>
      <tr><td class="lbl">Financement</td><td>${marche?.financement ?? "—"}</td></tr>
      <tr><td class="lbl">Imputation budgétaire</td><td>${det.ligneBudgetaireCode ?? "—"}</td></tr>
    </table>
    <table>
      <tr><td class="lbl">Montant TTC</td><td class="num">${g("montantTtcGnf")}</td></tr>
      <tr><td class="lbl">Précompte TVA</td><td class="num">− ${g("precompteTvaGnf")}</td></tr>
      <tr><td class="lbl">Retenue de garantie</td><td class="num">− ${g("retenueGarantie")}</td></tr>
      <tr><td class="lbl">Redevance ARMP</td><td class="num">− ${g("montantArmpGnf")}</td></tr>
      <tr><td class="lbl">Récupération avance</td><td class="num">− ${g("avanceRecuperee")}</td></tr>
      <tr><td class="lbl">Pénalités</td><td class="num">− ${g("penalites")}</td></tr>
      <tr><td class="lbl" style="font-size:13px;background:#dcfce7">NET À PAYER AU BÉNÉFICIAIRE</td>
          <td class="num" style="font-weight:bold;font-size:15px;color:#166534;background:#dcfce7">${g("netAPayer")}</td></tr>
    </table>
    <p style="font-size:10px;color:#6b7280;margin:14px 0 26px">
      Certifié exact et bon à payer, sous réserve des visas ci-dessous. Le présent bordereau
      accompagne le dossier de décompte dans le circuit financier (Budget/MEF → Trésor → BCRG).
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;text-align:center;margin-top:46px">
      <div><div style="border-top:1px solid #111;padding-top:6px">Le Chef comptable</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">Le DAF</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">Le Directeur Général</div></div>
    </div>
    <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#166534;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">Imprimer</button>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html); win.document.close();
  setTimeout(() => win.print(), 500);
}


// ─── PV de réception imprimable (OPR / provisoire / définitive) ────────────────
export function imprimerPV(rec: Record<string, unknown>) {
  const marche = rec.marche as Record<string, unknown> | undefined;
  const entreprise = (marche?.entreprise ?? rec.entreprise) as Record<string, unknown> | undefined;
  const TYPE_LBL: Record<string, string> = { OPR: "OPÉRATIONS PRÉALABLES À LA RÉCEPTION (OPR)", PROVISOIRE: "RÉCEPTION PROVISOIRE", DEFINITIVE: "RÉCEPTION DÉFINITIVE" };
  const fdate = (x: unknown) => x ? new Date(x as string).toLocaleDateString("fr-FR") : "—";
  const reserves = Array.isArray(rec.reserves) ? (rec.reserves as string[]) : [];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PV — ${marche?.reference ?? ""}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      td{border:1px solid #d1d5db;padding:6px 10px}
      .lbl{background:#f3f4f6;font-weight:bold;width:34%}
      @media print{button{display:none}}</style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <div><h1 style="margin:0;font-size:17px;color:#1B2A4A">AGEROUTE GUINÉE</h1>
      <p style="margin:2px 0;font-size:11px;color:#6b7280">Agence de Gestion des Routes — République de Guinée</p></div>
      <div style="text-align:right;font-size:11px;color:#6b7280">PV n° ${rec.pvNumero ?? "________"}<br/>${new Date().toLocaleDateString("fr-FR")}</div>
    </div>
    <h2 style="background:#1B2A4A;color:#fff;padding:8px 12px;font-size:14px;margin:0 0 14px;text-align:center">
      PROCÈS-VERBAL DE ${TYPE_LBL[String(rec.type)] ?? String(rec.type)}
    </h2>
    <table>
      <tr><td class="lbl">Marché</td><td>${marche?.reference ?? "—"} — ${marche?.intitule ?? ""}</td></tr>
      <tr><td class="lbl">Entreprise</td><td>${entreprise?.raisonSociale ?? "—"}</td></tr>
      <tr><td class="lbl">Date prévue</td><td>${fdate(rec.datePrevu)}</td></tr>
      <tr><td class="lbl">Date de la réception</td><td style="font-weight:bold">${fdate(rec.dateReelle)}</td></tr>
      <tr><td class="lbl">Statut</td><td>${rec.statut}</td></tr>
    </table>
    <h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">COMMISSION DE RÉCEPTION — PRÉSENTS</h3>
    <table>
      <tr><td class="lbl">Représentant(s) de l'entreprise</td><td>${rec.presentsEntreprise ?? "—"}</td></tr>
      <tr><td class="lbl">Ingénieurs AGEROUTE</td><td>${rec.presentsAgeroute ?? "—"}</td></tr>
      <tr><td class="lbl">Autres (bailleur, bureau de contrôle…)</td><td>${rec.presentsAutres ?? "—"}</td></tr>
    </table>
    <h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">RÉSERVES ${reserves.length ? `(${reserves.length})` : "— NÉANT"}</h3>
    ${reserves.length ? `<table>${reserves.map((x, i) => `<tr><td class=\"lbl\">Réserve ${i + 1}</td><td>${x}</td></tr>`).join("")}
      <tr><td class="lbl">Délai de levée</td><td>${rec.delaiLeveeReserves ? rec.delaiLeveeReserves + " jours" : "—"}</td></tr>
      <tr><td class="lbl">Levées le</td><td>${fdate(rec.dateLeveeReserves)}</td></tr></table>` : ""}
    ${rec.observations ? `<h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">OBSERVATIONS</h3><p style="border:1px solid #d1d5db;padding:8px 10px">${rec.observations}</p>` : ""}
    ${Array.isArray(rec.pieces) && (rec.pieces as Array<{nom:string}>).length ? `<h3 style="font-size:13px;color:#1B2A4A;margin:14px 0 8px">PIÈCES ANNEXÉES AU PRÉSENT PV</h3><table>${(rec.pieces as Array<{nom:string;type?:string}>).map((pc, i) => `<tr><td class=\"lbl\">Annexe ${i + 1}</td><td>${pc.type === "PHOTO" ? "Photo" : "Document"} — ${pc.nom}</td></tr>`).join("")}</table>` : ""}
    <p style="font-size:10px;color:#6b7280;margin:16px 0 30px">
      Le présent procès-verbal est établi en application du CCAG Travaux. Il est signé par les membres
      de la commission et vaut ${String(rec.type) === "DEFINITIVE" ? "libération des obligations contractuelles sous réserve de la garantie décennale" : "prise de possession partielle des ouvrages sous réserve des garanties contractuelles"}.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;text-align:center;margin-top:44px">
      <div><div style="border-top:1px solid #111;padding-top:6px">L'Entreprise<br/>(nom, qualité, signature)</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">La Mission de Contrôle<br/>(nom, signature)</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;text-align:center;margin-top:40px">
      <div><div style="border-top:1px solid #111;padding-top:6px">La Direction Technique<br/>(nom, signature)</div></div>
      <div><div style="border-top:1px solid #111;padding-top:6px">AGEROUTE — DMC / DG<br/>(nom, signature, cachet)</div></div>
    </div>
    <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#1B2A4A;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">Imprimer</button>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html); win.document.close();
  setTimeout(() => win.print(), 500);
}
