/**
 * Prestataire SIMULÉ — pour le développement et les tests, jamais pour
 * produire une preuve.
 *
 * Il ne signe rien au sens cryptographique : il renvoie le PDF reçu, auquel il
 * ajoute un commentaire de fin de fichier qui l'identifie sans ambiguïté comme
 * une simulation. Le filigrane imposé par la configuration (G5) est déjà dans
 * le PDF quand il arrive ici. Un validateur DSS sur ce document répondra
 * INDETERMINATE ou FAILED — c'est le comportement attendu.
 */
import { createHash } from "node:crypto";
import type { AdaptateurPrestataire, ContexteSignature, ResultatSignature, EtatSante } from "./interfaces";

export class AdaptateurSimule implements AdaptateurPrestataire {
  readonly nom = "simule";
  readonly simule = true;

  async signerPdf(pdf: Buffer, ctx: ContexteSignature): Promise<ResultatSignature> {
    const empreinte = createHash("sha256").update(pdf).digest("hex");
    const marque = Buffer.from(
      `\n%% SIMULATION — SANS VALEUR JURIDIQUE — aucun certificat, aucune clé, aucune signature cryptographique.` +
      `\n%% reference=${ctx.reference} signataire=${ctx.signataire.email} role=${ctx.signataire.role} sha256=${empreinte}\n`,
      "utf8",
    );
    return {
      pdfSigne: Buffer.concat([pdf, marque]),
      prestataire: this.nom,
      niveauObtenu: "B",
      detail: { simule: true, avertissement: "Aucune signature cryptographique n'a été apposée.", sha256Source: empreinte },
    };
  }

  async sante(): Promise<EtatSante> {
    return { ok: true, detail: "Adaptateur simulé — toujours disponible, jamais probant." };
  }
}
