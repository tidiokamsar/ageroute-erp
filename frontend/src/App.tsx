import { useEffect } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { authStore, useAuth } from "./lib/auth";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntreprisesPage } from "./pages/EntreprisesPage";
import { MarchesPage } from "./pages/MarchesPage";
import { DecomptesPage } from "./pages/DecomptesPage";
import { AttachementsPage } from "./pages/AttachementsPage";
import { AuditPage } from "./pages/AuditPage";
import WorkflowPage from "./pages/WorkflowPage";
import RoutierPage from "./pages/RoutierPage";
import UsersPage from "./pages/UsersPage";
import { ProjetsPage } from "./pages/ProjetsPage";
import { ParametragePage } from "./pages/ParametragePage";
import { GarantiesPage } from "./pages/GarantiesPage";
import { ReceptionsPage } from "./pages/ReceptionsPage";
import { AvenantsPage } from "./pages/AvenantsPage";
import { FinancierPage } from "./pages/FinancierPage";
import { FinancementsPage } from "./pages/FinancementsPage";
import { PaiementsPage } from "./pages/PaiementsPage";
import { BiPage } from "./pages/BiPage";
import PortailEntreprisePage from "./pages/PortailEntreprisePage";
import SignaturePage from "./pages/SignaturePage";
import { DelegationsPage } from "./pages/DelegationsPage";
import { RevisionPage } from "./pages/RevisionPage";
import { Toaster } from "./components/ui/Toast";

// Guard standard — redirige ENTREPRISE vers /portail
function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ENTREPRISE") return <Navigate to="/portail" replace />;
  return <Outlet />;
}

// Guard portail — seuls ENTREPRISE + ADMIN
function PortailRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!["ENTREPRISE", "ADMIN"].includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />

      {/* Portail entreprise — layout minimal dédié */}
      <Route element={<PortailRoute />}>
        <Route path="/portail" element={<PortailEntreprisePage />} />
      </Route>

      {/* Application principale — tous les autres rôles */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} handle={{ title: "Tableau de bord" }} />
          <Route path="entreprises" element={<EntreprisesPage />} handle={{ title: "Référentiel Entreprises" }} />
          <Route path="financements" element={<FinancementsPage />} handle={{ title: "Gestion des Financements" }} />
              <Route path="paiements" element={<PaiementsPage />} handle={{ title: "Paiements" }} />
          <Route path="projets" element={<ProjetsPage />} handle={{ title: "Projets §6" }} />
          <Route path="marches" element={<MarchesPage />} handle={{ title: "Marchés" }} />
          <Route path="decomptes" element={<DecomptesPage />} handle={{ title: "e-Décomptes §7-16" }} />
          <Route path="attachements" element={<AttachementsPage />} handle={{ title: "Attachements §9" }} />
          <Route path="audit" element={<AuditPage />} handle={{ title: "Journal d'audit §19" }} />
          <Route path="workflow" element={<WorkflowPage />} handle={{ title: "Mes tâches §10" }} />
          <Route path="routier" element={<RoutierPage />} handle={{ title: "Référentiel Routier" }} />
          <Route path="utilisateurs" element={<UsersPage />} handle={{ title: "Gestion Utilisateurs §23" }} />
          <Route path="parametrage"  element={<ParametragePage />}  handle={{ title: "Paramétrage §22" }} />
          <Route path="garanties"   element={<GarantiesPage />}   handle={{ title: "Garanties marchés" }} />
          <Route path="receptions"  element={<ReceptionsPage />}  handle={{ title: "Réceptions — OPR / PV" }} />
          <Route path="avenants"    element={<AvenantsPage />}    handle={{ title: "Avenants marchés" }} />
          <Route path="financier"   element={<FinancierPage />}   handle={{ title: "Gestion financière" }} />
          <Route path="bi"          element={<BiPage />}          handle={{ title: "BI & Reporting" }} />
          <Route path="signatures"    element={<SignaturePage />}   handle={{ title: "Signature électronique" }} />
          <Route path="delegations"   element={<DelegationsPage />} handle={{ title: "Délégations d'intérim" }} />
          <Route path="revision"      element={<RevisionPage />}    handle={{ title: "Révision de prix" }} />
        </Route>
      </Route>
    </>
  )
);

export function App() {
  useEffect(() => { authStore.loadMe(); }, []);
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
