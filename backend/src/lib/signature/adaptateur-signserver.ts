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
    // Le niveau réellement obtenu dépend du worker (TSA configurée → T ; LT/LTA
    // exigent une post-extension DSS). On annonce au plus le niveau demandé.
    const niveauObtenu: NiveauPades = ctx.tsaUrl ? (ctx.niveau === "B" ? "T" : ctx.niveau) : "B";
    return {
      pdfSigne: Buffer.from(reponse.data.data, "base64"),
      prestataire: this.nom,
      niveauObtenu,
      detail: { worker: this.opts.worker, archiveId: reponse.data.archiveId ?? null, metaData: reponse.data.metaData ?? null, laboratoire: this.opts.laboratoire },
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
