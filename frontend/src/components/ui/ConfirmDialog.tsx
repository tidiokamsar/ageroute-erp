/**
 * Boîte de dialogue de confirmation pour les actions sensibles.
 * Remplace les window.confirm() natifs : libellé explicite, variante danger,
 * bouton de confirmation nominatif — indispensable pour les opérations
 * financières irréversibles (suppression, mainlevée, blocage).
 */
import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false, loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${danger ? "bg-red-50" : "bg-amber-50"}`}>
            <AlertTriangle size={18} className={danger ? "text-red-500" : "text-amber-500"} />
          </div>
          <div className="text-sm text-gray-600 pt-1.5">{message}</div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm px-3.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm()}
            disabled={loading}
            className={`text-sm px-4 py-1.5 rounded-lg text-white disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-navy hover:bg-navy/90"
            }`}
          >
            {loading ? "Traitement…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
