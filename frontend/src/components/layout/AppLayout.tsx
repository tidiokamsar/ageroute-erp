import { useState, useEffect } from "react";
import { Outlet, useMatches, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";

export function AppLayout() {
  const matches = useMatches();
  const current = matches[matches.length - 1] as { handle?: { title?: string } } | undefined;
  const title = current?.handle?.title ?? "ERP AGEROUTE";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-100 flex items-center gap-4 px-4 md:px-6 shrink-0">
          <button className="md:hidden text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-navy">{title}</h1>
          <div className="ml-auto flex items-center gap-4">
            <GlobalSearch />
            <a href="https://carte.ageroute.gov.gn" target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-navy transition-colors">
              → Géoportail
            </a>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
