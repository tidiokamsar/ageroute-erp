import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseApiError } from "../../lib/api";
import { openSecureFile } from "../../lib/secureFile";
import { Upload, File, X, ExternalLink, Eye } from "lucide-react";
import { Modal } from "./Modal";
import { toast } from "./Toast";

interface UploadedFile {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface DocumentWithFile {
  id?: string;
  type?: string;
  libelle?: string;
  fileUrl?: string;
  filename?: string;
}

interface FileUploadModalProps {
  open: boolean;
  onClose: () => void;
  // After uploading the file, this callback is called with the fileUrl to let the parent save the document
  onFileUploaded: (fileUrl: string, filename: string) => void;
  title?: string;
}

export function FileUploadModal({ open, onClose, onFileUploaded, title = "Téléverser un fichier" }: FileUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"];

  function handleFile(f: File | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error("Type non autorisé — PDF, images, Word ou Excel uniquement");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Fichier trop volumineux — maximum 20 MB");
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<UploadedFile>("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      toast.success("Fichier téléversé avec succès");
      onFileUploaded(res.data.url, res.data.originalName);
      onClose();
      setFile(null);
    } catch (e) {
      toast.error(parseApiError(e));
    } finally {
      setUploading(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-navy/40 hover:bg-blue-50/30 transition"
        >
          <Upload size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">Glisser-déposer ou <span className="text-navy font-medium">cliquer pour choisir</span></p>
          <p className="text-xs text-gray-400 mt-1">PDF, Image, Word, Excel — max 20 Mo</p>
          <input ref={inputRef} type="file" className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
            onChange={e => handleFile(e.target.files?.[0] ?? null)} />
        </div>

        {file && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <File size={16} className="text-navy shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
            </div>
            <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
        )}

        {uploading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Téléversement...</span><span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-navy transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={upload} disabled={!file || uploading}
            className="text-sm px-4 py-1.5 bg-navy text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            <Upload size={14} />
            {uploading ? `${progress}%` : "Téléverser"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Composant pour afficher/ouvrir un document uploadé
interface DocumentViewerProps {
  url: string;
  filename?: string;
  className?: string;
}

export function DocumentViewer({ url, filename, className = "" }: DocumentViewerProps) {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  const isPdf = /\.pdf$/i.test(url);
  const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;

  function open() {
    // Pour les fichiers protégés, obtenir une URL signée éphémère avant l'ouverture
    void openSecureFile(fullUrl);
  }

  return (
    <button onClick={open} title={filename ?? "Voir le document"}
      className={`inline-flex items-center gap-1 text-xs text-navy hover:underline ${className}`}>
      {isImage ? <Eye size={12} /> : <ExternalLink size={12} />}
      {filename ? (filename.length > 30 ? filename.slice(0, 28) + "…" : filename) : "Voir le fichier"}
    </button>
  );
}
