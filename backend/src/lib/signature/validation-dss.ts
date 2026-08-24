/**
 * Validation PAdES par DSS (Digital Signature Service, Commission européenne) —
 * service REST isolé. Indépendant du prestataire : il restera le moteur de
 * validation quand un prestataire agréé remplacera le laboratoire.
 *
 * Référence : https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eSignature+HUB
 *   POST {url}/services/rest/validation/validateSignature
 *   { "signedDocument": { "bytes": "<base64>", "name": "x.pdf" }, "originalDocuments": null, "policy": null }
 *   → { "SimpleReport": { "signatureOrTimestampOrEvidenceRecord": [ { "Signature": { "Indication": "TOTAL_PASSED" | "FAILED" | "INDETERMINATE", ... } } ] }, "DetailedReport": …, "DiagnosticData": … }
 */
import axios, { type AxiosInstance } from "axios";
import type { ServiceValidation, IndicationValidation, EtatSante } from "./interfaces";

export class ServiceValidationDss implements ServiceValidation {
  readonly nom = "dss";
  private readonly http: AxiosInstance;

  constructor(url: string) {
    this.http = axios.create({ baseURL: url.replace(/\/+$/, ""), timeout: 60_000, maxBodyLength: 50 * 1024 * 1024, maxContentLength: 50 * 1024 * 1024 });
  }

  async validerPdf(pdf: Buffer, nomFichier: string): Promise<{ indication: IndicationValidation; rapport: Record<string, unknown> }> {
    const r = await this.http.post<Record<string, unknown>>("/services/rest/validation/validateSignature", {
      signedDocument: { bytes: pdf.toString("base64"), name: nomFichier },
      originalDocuments: null,
      policy: null,
    });
    const simple = (r.data?.SimpleReport ?? {}) as Record<string, unknown>;
    const entrees = (simple.signatureOrTimestampOrEvidenceRecord ?? simple.signature ?? []) as Array<Record<string, unknown>>;
    let indication: IndicationValidation = "INDETERMINATE";
    if (entrees.length === 0) {
      indication = "FAILED"; // aucun objet de signature trouvé : le document n'est pas signé
    } else {
      const indications = entrees.map((e) => String(((e.Signature ?? e) as Record<string, unknown>).Indication ?? "INDETERMINATE"));
      if (indications.every((i) => i === "TOTAL_PASSED")) indication = "TOTAL_PASSED";
      else if (indications.some((i) => i === "FAILED")) indication = "FAILED";
      else if (indications.every((i) => i === "PASSED" || i === "TOTAL_PASSED")) indication = "PASSED";
    }
    // On conserve le rapport simple et le diagnostic — pas le détaillé, trop volumineux pour une colonne.
    return { indication, rapport: { SimpleReport: simple, DiagnosticData: r.data?.DiagnosticData ?? null } };
  }

  async sante(): Promise<EtatSante> {
    try {
      // La sonde interroge la RACINE de l'application, pas l'endpoint POST :
      // selon les versions, un GET sur celui-ci répond 405 ou 500 alors même
      // que le POST fonctionne — constaté le 24/08/2026, la validation
      // répondait INDETERMINATE pendant que la sonde annonçait « indisponible ».
      const r = await this.http.get("/", { timeout: 5_000, validateStatus: () => true, maxRedirects: 2 });
      return r.status < 500
        ? { ok: true, detail: `DSS répond (${r.status})` }
        : { ok: false, detail: `DSS : HTTP ${r.status} sur la racine de l'application` };
    } catch (e) {
      return { ok: false, detail: `DSS injoignable : ${(e as Error).message}` };
    }
  }
}

/** Sans service de validation configuré : on le dit, on n'invente rien. */
export class ValidationAbsente implements ServiceValidation {
  readonly nom = "aucune";
  async validerPdf(): Promise<{ indication: IndicationValidation; rapport: Record<string, unknown> }> {
    return { indication: "NON_VERIFIE", rapport: { motif: "Aucun service de validation configuré (SIG_DSS_URL vide)." } };
  }
  async sante(): Promise<EtatSante> { return { ok: false, detail: "Aucun service de validation configuré." }; }
}
