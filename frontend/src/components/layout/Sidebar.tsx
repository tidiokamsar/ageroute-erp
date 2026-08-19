import { NavLink } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "../../lib/auth";
import {
  LayoutDashboard, Building2, FileText, Receipt, Paperclip,
  Users, ClipboardList, LogOut, GitBranch, Map,
  FolderOpen, Settings, ShieldCheck, Shield, ClipboardCheck,
  FileSignature, CreditCard, BarChart2, Landmark, UserCheck, TrendingUp,
} from "lucide-react";
import { authStore } from "../../lib/auth";
import { LogoAgeroute } from "../ui/LogoAgeroute";

// Logo AGEROUTE Guinée
/** Emblème officiel AGEROUTE — posé sur cartouche blanc, la barre étant navy. */
function AgeroiteLogo() {
  return <LogoAgeroute taille={44} />;
}

// ─── DÉFINITION RBAC PAR RÔLE ────────────────────────────────────────────────
// Chaque entrée = { to, label, icon, roles: [] } — "ALL" = tous sauf ENTREPRISE
// Ordre = ordre d'affichage dans le sidebar

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles: string[]; // rôles autorisés; ["ALL"] = tout le monde connecté sauf ENTREPRISE
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles?: string[]; // filtre la section entière si présent
}

// Groupes de rôles pour simplifier
const ALL_INTERNAL = ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","AUDITEUR","BAILLEUR","BUDGET","TRESOR","FER_AGT","BCRG"];
const DIRECTION = ["ADMIN","DG","DAF","DMC","UGP"];
const FINANCES = ["ADMIN","DG","DAF","BUDGET","TRESOR","FER_AGT","BCRG"];
const CONTROLE = ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"];
const AUDIT_ROLES = ["ADMIN","DG","DAF","DMC","AUDITEUR"];

const NAV_SECTIONS: NavSection[] = [
  {
    title: "PILOTAGE",
    items: [
      {
        to: "/",
        label: "Tableau de bord",
        icon: LayoutDashboard,
        roles: ALL_INTERNAL,
      },
      {
        to: "/bi",
        label: "BI & Reporting",
        icon: BarChart2,
        roles: ["ADMIN","DG","DAF","DMC","UGP","BAILLEUR"],
      },
    ],
  },
  {
    title: "§6 RÉFÉRENTIELS",
    items: [
      {
        to: "/projets",
        label: "Projets",
        icon: FolderOpen,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR"],
      },
      {
        to: "/entreprises",
        label: "Entreprises",
        icon: Building2,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"],
      },
      {
        to: "/marches",
        label: "Marchés",
        icon: FileText,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET"],
      },
      {
        to: "/avenants",
        label: "Avenants",
        icon: FileSignature,
        roles: ["ADMIN","DG","DAF","DMC","UGP"],
      },
    ],
  },
  {
    title: "§7-16 E-DÉCOMPTES",
    items: [
      {
        to: "/decomptes",
        label: "e-Décomptes",
        icon: Receipt,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET","TRESOR","BCRG","FER_AGT"],
      },
      {
        to: "/attachements",
        label: "Attachements §9",
        icon: Paperclip,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"],
      },
      {
        to: "/workflow",
        label: "Mes tâches §10",
        icon: GitBranch,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BUDGET","TRESOR","BCRG","FER_AGT"],
      },
    ],
  },
  {
    title: "EXÉCUTION MARCHÉS",
    items: [
      {
        to: "/garanties",
        label: "Garanties",
        icon: Shield,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION"],
      },
      {
        to: "/receptions",
        label: "Réceptions / PV",
        icon: ClipboardCheck,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"],
      },
      {
        to: "/revision",
        label: "Révision de prix",
        icon: TrendingUp,
        roles: ["ADMIN","DG","DAF","DMC","UGP"],
      },
      {
        to: "/delegations",
        label: "Délégations d'intérim",
        icon: UserCheck,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"],
      },
    ],
  },
  {
    title: "GESTION FINANCIÈRE",
    items: [
      {
        to: "/financier",
        label: "Circuit paiement",
        icon: CreditCard,
        roles: ["ADMIN","DG","DAF","BUDGET","TRESOR","FER_AGT","BCRG"],
      },
      {
        to: "/financements",
        label: "Financements",
        icon: Landmark,
        roles: ["ADMIN","DG","DAF","BAILLEUR","BUDGET"],
      },
    ],
  },
  {
    title: "SUIVI & AUDIT",
    items: [
      {
        to: "/audit",
        label: "Journal d'audit",
        icon: ClipboardList,
        roles: ["ADMIN","DG","DAF","DMC","AUDITEUR"],
      },
      {
        to: "/signatures",
        label: "Signature & Audit",
        icon: Shield,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION"],
      },
      {
        to: "/routier",
        label: "Référentiel routier",
        icon: Map,
        roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR"],
      },
    ],
  },
];

// Section portail entreprise (séparée) — liens profonds vers les onglets du portail
const PORTAIL_ITEMS: NavItem[] = [
  { to: "/portail?tab=decomptes",    label: "Mes décomptes",    icon: Receipt,       roles: ["ENTREPRISE"] },
  { to: "/portail?tab=attachements", label: "Mes attachements", icon: Paperclip,     roles: ["ENTREPRISE"] },
  { to: "/portail?tab=receptions",   label: "Réceptions / PV",  icon: ClipboardCheck,roles: ["ENTREPRISE"] },
];

// Labels lisibles par rôle pour affichage
const ROLE_LABELS: Record<string, string> = {
  ADMIN:     "Administrateur",
  DG:        "Directeur Général",
  DAF:       "Dir. Admin & Fin.",
  DMC:       "Dir. Marchés & Contrats",
  UGP:       "Unité Gest. de Projet",
  MISSION:   "Équipe Mission",
  TECHNIQUE: "Dir. Technique",
  AUDITEUR:  "Auditeur",
  BAILLEUR:  "Représentant Bailleur",
  BUDGET:    "Direction du Budget",
  TRESOR:    "Trésor / DNTCP",
  FER_AGT:   "Fonds Entretien Routier",
  BCRG:      "Banque Centrale",
  ENTREPRISE:"Portail Entreprise",
};

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { user } = useAuth();
  const role = user?.role ?? "";

  function Item({ to, label, Icon }: { to: string; label: string; Icon: React.ElementType }) {
    return (
      <NavLink
        to={to}
        end={to === "/"}
        className={({ isActive }) => clsx(
          "flex items-center gap-3 px-3 py-2 text-sm mx-2 rounded-lg transition-all duration-150",
          isActive
            ? "bg-gold text-navy font-bold shadow-sm"
            : "text-white/65 hover:bg-white/10 hover:text-white"
        )}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate leading-tight">{label}</span>
      </NavLink>
    );
  }

  // ─── PORTAIL ENTREPRISE — navigation dédiée ───────────────────────────────
  if (role === "ENTREPRISE") {
    return (
      <>
        {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}
        <aside className={clsx(
          "fixed md:static inset-y-0 left-0 z-40 w-64 flex flex-col h-screen transition-transform md:translate-x-0",
          "bg-navy text-white",
          open ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="px-4 py-4 border-b border-white/10 bg-black/20">
            <div className="flex items-center gap-3">
              <AgeroiteLogo />
              <div className="min-w-0">
                <div className="flex items-baseline gap-0 leading-none mb-0.5">
                  <span className="text-base font-black tracking-tight text-gold">AGE</span>
                  <span className="text-base font-black tracking-tight text-white">ROUTE</span>
                </div>
                <p className="text-[9px] font-medium text-white/45 leading-tight">Portail Entreprise</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3">
            <div className="mb-4">
              <p className="px-4 mb-1.5 text-[9px] font-black tracking-[0.18em] text-white/25 uppercase">MON ESPACE</p>
              <Item to="/portail" label="Tableau de bord" Icon={LayoutDashboard} />
              {PORTAIL_ITEMS.map(({ to, label, icon: Icon }) => (
                <Item key={to} to={to} label={label} Icon={Icon} />
              ))}
            </div>
          </nav>
          {user && (
            <div className="px-4 py-4 border-t border-white/10 bg-black/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-sm font-black text-gold shrink-0">
                  {user.nomComplet?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{user.nomComplet}</p>
                  <p className="text-[10px] text-gold/60 font-mono">Entreprise</p>
                </div>
              </div>
              <button onClick={() => authStore.logout()} className="flex items-center gap-2 text-xs text-white/40 hover:text-white transition-colors w-full">
                <LogOut className="h-3.5 w-3.5" /> Déconnexion
              </button>
            </div>
          )}
        </aside>
      </>
    );
  }

  // ─── NAVIGATION INTERNE — filtrée par rôle ────────────────────────────────
  const modules = user?.modules;
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      const key = item.to === "/" ? "dashboard" : item.to.replace(/^\//, "");
      if (modules) return modules.includes(key);   // droits effectifs par utilisateur
      return item.roles.includes(role);            // repli : accès par rôle
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside className={clsx(
        "fixed md:static inset-y-0 left-0 z-40 w-64 flex flex-col h-screen transition-transform md:translate-x-0",
        "bg-navy text-white",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* En-tête logo AGEROUTE */}
        <div className="px-4 py-4 border-b border-white/10 bg-black/20">
          <div className="flex items-center gap-3">
            <AgeroiteLogo />
            <div className="min-w-0">
              <div className="flex items-baseline gap-0 leading-none mb-0.5">
                <span className="text-base font-black tracking-tight text-gold">AGE</span>
                <span className="text-base font-black tracking-tight text-white">ROUTE</span>
              </div>
              <p className="text-[9px] font-medium text-white/45 leading-tight">
                Agence de Gestion des Routes
              </p>
              <p className="text-[9px] font-bold text-gold/70 uppercase tracking-widest mt-0.5">Guinée</p>
            </div>
          </div>
          <div className="mt-2.5 h-px bg-gold/20 rounded" />
          <p className="mt-1.5 text-[9px] text-white/25 text-center uppercase tracking-[0.12em]">
            Système e-Décomptes
          </p>
        </div>

        {/* Navigation filtrée */}
        <nav className="flex-1 overflow-y-auto py-3">
          {visibleSections.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-4 mb-1.5 text-[9px] font-black tracking-[0.18em] text-white/25 uppercase">
                {section.title}
              </p>
              {section.items.map(({ to, label, icon: Icon }) => (
                <Item key={to} to={to} label={label} Icon={Icon} />
              ))}
            </div>
          ))}

          {/* Score conformité — DAF/DG/DMC/ADMIN */}
          {["ADMIN","DG","DAF","DMC","UGP"].includes(role) && (
            <div className="mb-4">
              <p className="px-4 mb-1.5 text-[9px] font-black tracking-[0.18em] text-white/25 uppercase">
                CONFORMITÉ §CDC
              </p>
              <NavLink to="/entreprises"
                className={({ isActive }) => clsx(
                  "flex items-center gap-3 px-3 py-2 text-sm mx-2 rounded-lg transition-all",
                  isActive ? "bg-gold text-navy font-bold" : "text-white/65 hover:bg-white/10 hover:text-white"
                )}>
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Score conformité</span>
              </NavLink>
            </div>
          )}

          {/* Administration — ADMIN seulement */}
          {role === "ADMIN" && (
            <div className="mb-4">
              <p className="px-4 mb-1.5 text-[9px] font-black tracking-[0.18em] text-white/25 uppercase">
                ADMINISTRATION
              </p>
              <Item to="/utilisateurs" label="Utilisateurs §23" Icon={Users} />
              <Item to="/parametrage"  label="Paramétrage §22"  Icon={Settings} />
            </div>
          )}
        </nav>

        {/* Utilisateur connecté */}
        {user && (
          <div className="px-4 py-4 border-t border-white/10 bg-black/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-sm font-black text-gold shrink-0">
                {user.nomComplet?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{user.nomComplet}</p>
                <p className="text-[10px] text-white/40 font-mono text-[9px]">
                  {ROLE_LABELS[role] ?? role}
                </p>
              </div>
            </div>
            <button
              onClick={() => authStore.logout()}
              className="flex items-center gap-2 text-xs text-white/40 hover:text-white transition-colors w-full">
              <LogOut className="h-3.5 w-3.5" /> Déconnexion
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
