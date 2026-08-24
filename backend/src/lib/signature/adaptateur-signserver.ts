/**
 * Adaptateur SignServer Community (Keyfactor) — prestataire de signature
 * centralisé, API REST. En laboratoire il signe avec une clé SoftHSM2 et un
 * certificat de test EJBCA ; chez un prestataire agréé ce serait la même API
 * devant un HSM certifié. L'ERP ne voit jamais la clé : il envoie le PDF au
 * worker, il reçoit le PDF signé.
 *
 * Référence : https://docs.keyfactor.com/signserver/latest/rest-interface
 *   POST {url}/signserver/rest/v1/workers/{worker}/process
 *   { "data": "<base64>", "encoding": "BASE64", "metaData": { ... } }
 *   → { "data": "<base64>", "archiveId": …, "metaData": { ... } }
 *
 * Les secrets (basic ou mTLS) viennent de l'ENVIRONNEMENT, jamais de la base :
 *   SIG_PRESTATAIRE_UTILISATEUR / SIG_PRESTATAIRE_MOT_DE_PASSE   (basic)
 *   SIG_PRESTATAIRE_CERT_CLIENT / SIG_PRESTATAIRE_CLE_CLIENT      (mtls, chemins PEM)
 *   SIG_PRESTATAIRE_CA                                            (PEM de l'autorité du serveur)
 */
import axios, { type AxiosInstance } from "axios";
import https from "node:https";
import fs from "node:fs";
import type { AdaptateurPrestataire, ContexteSignature, ResultatSignature, EtatSante, NiveauPades } from "./interfaces";

export interface OptionsSignServer {
  url: string;
  worker: string;
  auth: "aucune" | "basic" | "mtls";
  /** Vrai en laboratoire : le résultat est marqué comme non probant. */
  laboratoire: boolean;
}

/**
 * Détecte un jeton d'horodatage RFC 3161 (attribut CMS signature-time-stamp,
 * OID 1.2.840.113549.1.9.16.2.14) dans les blocs /Contents du PDF. Les CMS y
 * sont encodés en hexadécimal : on décode avant de chercher l'OID en DER.
 */
export function contientJetonRfc3161(pdf: Buffer): boolean {
  const OID_DER = Buffer.from("060b2a864886f70d010910020e", "hex");
  const texte = pdf.toString("latin1");
  const motif = /\/Contents\s*<([0-9A-Fa-f\s]+)>/g;
  for (let m = motif.exec(texte); m !== null; m = motif.exec(texte)) {
    let hex = m[1].replace(/\s/g, "");
    if (hex.length % 2 === 1) hex = hex.slice(0, -1);
    if (Buffer.from(hex, "hex").includes(OID_DER)) return true;
  }
  return false;
}

export class AdaptateurSignServer implements AdaptateurPrestataire {
  readonly nom: string;
  readonly simule = false;
  private readonly http: AxiosInstance;

  constructor(private readonly opts: OptionsSignServer) {
    this.nom = `signserver${opts.laboratoire ? "-laboratoire" : ""}`;
    const agentOpts: https.AgentOptions = {};
    if (process.env.SIG_PRESTATAIRE_CA) agentOpts.ca = fs.readFileSync(process.env.SIG_PRESTATAIRE_CA);
    if (opts.auth === "mtls") {
      if (!process.env.SIG_PRESTATAIRE_CERT_CLIENT || !process.env.SIG_PRESTATAIRE_CLE_CLIENT) {
        throw new Error("Authentification mTLS demandée mais SIG_PRESTATAIRE_CERT_CLIENT / SIG_PRESTATAIRE_CLE_CLIENT absents de l'environnement");
      }
      agentOpts.cert = fs.readFileSync(process.env.SIG_PRESTATAIRE_CERT_CLIENT);
      agentOpts.key = fs.readFileSync(process.env.SIG_PRESTATAIRE_CLE_CLIENT);
    }
    this.http = axios.create({
      baseURL: opts.url.replace(/\/+$/, ""),
      timeout: 60_000,
      httpsAgent: new https.Agent(agentOpts),
      auth: opts.auth === "basic" && process.env.SIG_PRESTATAIRE_UTILISATEUR
        ? { username: process.env.SIG_PRESTATAIRE_UTILISATEUR, password: process.env.SIG_PRESTATAIRE_MOT_DE_PASSE ?? "" }
        : undefined,
      // Le PDF revient en base64 : 4/3 de sa taille. Un dossier de 50 pages reste loin de la limite.
      maxBodyLength: 50 * 1024 * 1024,
      maxContentLength: 50 * 1024 * 1024,
    });
  }

  async signerPdf(pdf: Buffer, ctx: ContexteSignature): Promise<ResultatSignature> {
    const reponse = await this.http.post<{ data?: string; archiveId?: string; metaData?: Record<string, unknown> }>(
      `/signserver/rest/v1/workers/${encodeURIComponent(this.opts.worker)}/process`,
      {
        data: pdf.toString("base64"),
        encoding: "BASE64",
        metaData: {
          // Métadonnées reprises par le PDFSigner dans les champs de signature.
          REASON: ctx.motif,
          LOCATION: "AGEROUTE Guinée",
          SIGNER_NAME: `${ctx.signataire.nom} (${ctx.signataire.role}${ctx.signataire.qualite ? " — " + ctx.signataire.qualite : ""})`,
          ERP_REFERENCE: ctx.reference,
          ERP_SIGNATAIRE_ID: ctx.signataire.id,
          ...(ctx.tsaUrl ? { TSA_URL: ctx.tsaUrl } : {}),
        },
      },
    );
    if (!reponse.data?.data) throw new Error("SignServer n'a renvoyé aucun document");
    const pdfSigne = Buffer.from(reponse.data.data, "base64");
    // Le niveau annoncé est CONSTATÉ, pas supposé : T seulement si un jeton
    // RFC 3161 est réellement présent dans la signature. En SignServer CE 7.3.2,
    // l'override TSA_URL par métadonnée de requête est resté sans effet (prouvé
    // le 24/08/2026) — la TSA se configure par la propriété TSA_WORKER du worker.
    const horodate = contientJetonRfc3161(pdfSigne);
    const niveauObtenu: NiveauPades = horodate ? (ctx.niveau === "B" ? "T" : ctx.niveau) : "B";
    return {
      pdfSigne,
      prestataire: this.nom,
      niveauObtenu,
      detail: { worker: this.opts.worker, archiveId: reponse.data.archiveId ?? null, metaData: reponse.data.metaData ?? null, laboratoire: this.opts.laboratoire, horodatageConstate: horodate },
    };
  }

  async sante(): Promise<EtatSante> {
    try {
      const r = await this.http.get<string>("/signserver/healthcheck/signserverhealth", { timeout: 5_000, responseType: "text" });
      const texte = String(r.data).trim();
      return { ok: /ALLOK/i.test(texte), detail: texte.slice(0, 200) };
    } catch (e) {
      return { ok: false, detail: `SignServer injoignable : ${(e as Error).message}` };
    }
  }
}
