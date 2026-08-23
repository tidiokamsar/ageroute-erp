import { useEffect, lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { authStore, useAuth } from "./lib/auth";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { Toaster } from "./components/ui/Toast";

/**
 * Chargement différé des pages — constat « bundle de 1,38 Mo, 23 pages chargées
 * de façon synchrone » de la revue du 22/08/2026. Chaque page devient un
 * morceau servi à la première visite ; l'écran de connexion ne charge plus les
 * décomptes, les marchés et le référentiel routier (Leaflet) pour rien.
 *
 * Les pages exportent tantôt un `default`, tantôt un nommé : `page()` uniformise.
 * Le découpage interne des grandes pages (1 300 à 1 600 lignes) est un chantier
 * distinct ; celui-ci ne touche qu'au moment où elles sont chargées.
 */
function page<T extends Record<string, ComponentType>>(charger: () => Promise<T>, nom: keyof T) {
  return lazy(() => charger().then((m) => ({ default: m[nom] })));
}

const DashboardPage        = page(() => import("./pages/DashboardPage"), "DashboardPage");
const EntreprisesPage      = page(() => import("./pages/EntreprisesPage"), "EntreprisesPage");
const MarchesPage          = page(() => import("./pages/MarchesPage"), "MarchesPage");
const DecomptesPage        = page(() => import("./pages/DecomptesPage"), "DecomptesPage");
const AttachementsPage     = page(() => import("./pages/AttachementsPage"), "AttachementsPage");
const AuditPage            = page(() => import("./pages/AuditPage"), "AuditPage");
const WorkflowPage         = lazy(() => import("./pages/WorkflowPage"));
const RoutierPage          = lazy(() => import("./pages/RoutierPage"));
const UsersPage            = lazy(() => import("./pages/UsersPage"));
const ProjetsPage          = page(() => import("./pages/ProjetsPage"), "ProjetsPage");
const ParametragePage      = page(() => import("./pages/ParametragePage"), "ParametragePage");
const GarantiesPage        = page(() => import("./pages/GarantiesPage"), "GarantiesPage");
const ReceptionsPage       = page(() => import("./pages/ReceptionsPage"), "ReceptionsPage");
const AvenantsPage         = page(() => import("./pages/AvenantsPage"), "AvenantsPage");
const FinancierPage        = page(() => import("./pages/FinancierPage"), "FinancierPage");
const FinancementsPage     = page(() => import("./pages/FinancementsPage"), "FinancementsPage");
const PaiementsPage        = page(() => import("./pages/PaiementsPage"), "PaiementsPage");
const BiPage               = page(() => import("./pages/BiPage"), "BiPage");
const PortailEntreprisePage = lazy(() => import("./pages/PortailEntreprisePage"));
const SignaturePage        = lazy(() => import("./pages/SignaturePage"));
const DelegationsPage      = page(() => import("./pages/DelegationsPage"), "DelegationsPage");
const RevisionPage         = page(() => import("./pages/RevisionPage"), "RevisionPage");

const Chargement = () => <div className="min-h-[40vh] flex items-center justify-center text-gray-400">Chargement...</div>;

// Guard standard — redirige ENTREPRISE vers /portail
function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ENTREPRISE") return <Navigate to="/portail" replace />;
  return <Suspense fallback={<Chargement />}><Outlet /></Suspense>;
}

// Guard portail — seuls ENTREPRISE + ADMIN
function PortailRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!["ENTREPRISE", "ADMIN"].includes(user.role)) return <Navigate to="/" replace />;
  return <Suspense fallback={<Chargement />}><Outlet /></Suspense>;
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
