/**
 * Fenêtre de signature — exigence « SIGNATURE INTÉGRÉE AUX DOCUMENTS ».
 *
 * Le signataire voit LE PDF EXACT qui sera signé (flux authentifié, jamais une
 * régénération), son empreinte SHA-256, son identité, sa qualité, l'étape, le
 * niveau demandé. Le consentement est une case NON cochée par défaut, avec la
 * déclaration imposée mot pour mot. La confirmation exige la réauthentification
 * par mot de passe. Jamais de signature en un clic.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, parseApiError } from "../../lib/api";
import { toast } from "../ui/Toast";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface Preparation {
  demandeId: string;
  document: { reference: string; version: string; sha256: string };
  signataire: { nom: string; qualite: string; role: string };
  etape: string;
  niveau: string;
  mode: string;
  date: string;
  expiresAt: string;
  consentement: string;
  urlPdf: string;
}

export function SignatureDocumentModal({ decompteId, onClose, onSigne }: { decompteId: string; onClose: () => void; onSigne: () => void }) {
  const [consentement, setConsentement] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { data: prep, error, isLoading } = useQuery<Preparation>({
    queryKey: ["signature-preparer", decompteId],
    queryFn: () => api.post(`/signature-numerique/decomptes/${decompteId}/preparer`).then((r) => r.data),
    retry: false,
    staleTime: Infinity,
  });

  // Le PDF de la demande est servi avec la session : on le charge en blob.
  useEffect(() => {
    let url: string | null = null;
    if (!prep) return;
    api.get(`/signature-numerique/demandes/${prep.demandeId}/pdf`, { responseType: "blob" })
      .then((r) => { url = URL.createObjectURL(r.data as Blob); setPdfUrl(url); })
      .catch(() => toast.error("Impossible d'afficher le document à signer"));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [prep]);

  const confirmer = useMutation({
    mutationFn: () => api.post(`/signature-numerique/demandes/${prep!.demandeId}/confirmer`, { motDePasse, consentement }).then((r) => r.data),
    onSuccess: (r: { etape: string; rang: number; etapeSuivante: string | null; circuitTermine: boolean; validationIndication: string; valeurJuridique: string; filigrane: boolean }) => {
      toast.success(
        r.circuitTermine
          ? `Étape « ${r.etape} » signée (rang ${r.rang}) — circuit terminé, dossier validé DG.`
          : `Étape « ${r.etape} » signée (rang ${r.rang}) — transmis à « ${r.etapeSuivante} ». Validation : ${r.validationIndication}.`,
      );
      if (r.filigrane) toast.error(`Rappel : ${r.valeurJuridique}`);
      onSigne();
      onClose();
    },
    onError: (e) => toast.error(parseApiError(e)),
  });

  return (
    <Modal open onClose={onClose} title="Signer ce document" size="xl">
      <div className="p-4 space-y-3 overflow-y-auto">
        {isLoading && <p className="text-sm text-gray-500">Préparation du document — gel de la version et calcul de l'empreinte…</p>}
        {error != null && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{parseApiError(error)}</p>}
        {prep && (
          <>
            {prep.mode !== "provider" && (
              <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2">
                Mode {prep.mode} — le document portera le filigrane de simulation et n'aura AUCUNE valeur juridique.
              </p>
            )}

            {/* 1. Le PDF exact qui sera signé */}
            <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-100" style={{ height: "42vh" }}>
              {pdfUrl
                ? <iframe title="Document à signer — version exacte" src={pdfUrl} className="w-full h-full" />
                : <div className="h-full flex items-center justify-center text-sm text-gray-400">Chargement du document…</div>}
            </div>

            {/* 2–8. Les faits de la signature */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p><span className="text-gray-500">Document :</span> <b className="font-mono">{prep.document.reference}</b> — {prep.document.version}</p>
              <p><span className="text-gray-500">Étape du circuit :</span> <b>{prep.etape}</b></p>
              <p className="md:col-span-2"><span className="text-gray-500">Empreinte SHA-256 :</span> <span className="font-mono break-all">{prep.document.sha256}</span></p>
              <p><span className="text-gray-500">Signataire :</span> <b>{prep.signataire.nom}</b> ({prep.signataire.role})</p>
              <p><span className="text-gray-500">Qualité exercée :</span> {prep.signataire.qualite}</p>
              <p><span className="text-gray-500">Date et heure :</span> {new Date(prep.date).toLocaleString("fr-FR")}</p>
              <p><span className="text-gray-500">Niveau demandé :</span> PAdES-{prep.niveau} <span className="text-gray-400">(expire {new Date(prep.expiresAt).toLocaleTimeString("fr-FR")})</span></p>
            </div>

            {/* 9–10. Consentement explicite, décoché par défaut */}
            <label className="flex items-start gap-2 text-xs border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} />
              <span className="font-medium text-gray-800">{prep.consentement}</span>
            </label>

            {/* 11. Réauthentification */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">Mot de passe du compte :</label>
              <input
                type="password"
                autoComplete="current-password"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="Réauthentification obligatoire avant l'apposition"
              />
            </div>

            {/* 12. Confirmation */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button onClick={() => confirmer.mutate()} disabled={!consentement || motDePasse.length === 0 || confirmer.isPending || !pdfUrl}>
                {confirmer.isPending ? "Signature en cours…" : "CONFIRMER ET SIGNER"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
