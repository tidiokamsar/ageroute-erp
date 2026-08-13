import { useState, useCallback, type ReactNode } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

interface Toast { id: number; type: "success" | "error"; message: string; }

let _add: ((t: Omit<Toast, "id">) => void) | null = null;
export const toast = {
  success: (message: string) => _add?.({ type: "success", message }),
  error: (message: string) => _add?.({ type: "error", message }),
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  _add = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm animate-in slide-in-from-right ${t.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {t.type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
