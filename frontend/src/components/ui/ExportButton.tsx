import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";

interface ExportButtonProps {
  endpoint: string;    // ex: "/export/marches"
  filename?: string;   // ex: "marches"
  params?: Record<string, string | undefined>;
  label?: string;
  size?: "sm" | "md";
}

export function ExportButton({ endpoint, filename, params, label = "Exporter CSV", size = "sm" }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function doExport() {
    setLoading(true);
    try {
      const res = await api.get(endpoint, {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename ?? "export"}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setLoading(false);
    }
  }

  const cls = size === "sm"
    ? "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50"
    : "inline-flex items-center gap-2 text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50";

  return (
    <button onClick={doExport} disabled={loading} className={cls}>
      <Download size={size === "sm" ? 13 : 15} />
      {loading ? "Export..." : label}
    </button>
  );
}
