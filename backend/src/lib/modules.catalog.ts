/**
 * Catalogue central des modules de l'ERP — source de vérité de l'accès.
 * `roles` = accès par défaut (miroir de la Sidebar). L'accès effectif d'un
 * utilisateur = rôle ∈ roles, sauf override explicite dans user_module_access :
 *   - allowed=false → module retiré (bloqué même si le rôle l'autorise)
 *   - allowed=true  → module accordé (visible même hors rôle par défaut)
 */
import { prisma } from "./prisma";

export interface ModuleDef { key: string; label: string; roles: string[]; }

export const MODULES: ModuleDef[] = [
  { key: "dashboard",    label: "Tableau de bord",       roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","AUDITEUR","BAILLEUR","BUDGET","TRESOR","FER_AGT","BCRG"] },
  { key: "bi",           label: "BI & Reporting",        roles: ["ADMIN","DG","DAF","DMC","UGP","BAILLEUR"] },
  { key: "projets",      label: "Projets",               roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR"] },
  { key: "entreprises",  label: "Entreprises",           roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"] },
  { key: "marches",      label: "Marchés",               roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET"] },
  { key: "avenants",     label: "Avenants",              roles: ["ADMIN","DG","DAF","DMC","UGP"] },
  { key: "decomptes",    label: "e-Décomptes",           roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET","TRESOR","BCRG","FER_AGT","ENTREPRISE"] },
  { key: "attachements", label: "Attachements",          roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","ENTREPRISE"] },
  { key: "workflow",     label: "Mes tâches",            roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BUDGET","TRESOR","BCRG","FER_AGT"] },
  { key: "garanties",    label: "Garanties",             roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION"] },
  { key: "receptions",   label: "Réceptions / PV",       roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","ENTREPRISE"] },
  { key: "revision",     label: "Révision de prix",      roles: ["ADMIN","DG","DAF","DMC","UGP"] },
  { key: "delegations",  label: "Délégations d'intérim", roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"] },
  { key: "financier",    label: "Circuit paiement",      roles: ["ADMIN","DG","DAF","BUDGET","TRESOR","FER_AGT","BCRG"] },
  { key: "financements", label: "Financements",          roles: ["ADMIN","DG","DAF","BAILLEUR","BUDGET"] },
  { key: "paiements",    label: "Paiements",             roles: ["ADMIN","DG","DAF","BUDGET","TRESOR"] },
  { key: "routier",      label: "Référentiel routier",   roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR"] },
  { key: "audit",        label: "Journal d'audit",       roles: ["ADMIN","DG","DAF","DMC","AUDITEUR"] },
  { key: "signatures",   label: "Signature électronique",roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION"] },
  { key: "utilisateurs", label: "Utilisateurs",          roles: ["ADMIN"] },
  { key: "parametrage",  label: "Paramétrage",           roles: ["ADMIN"] },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Accès effectif d'un utilisateur : liste des clés de modules autorisés. */
export async function getEffectiveModules(userId: string, role: string): Promise<string[]> {
  const overrides = await prisma.userModuleAccess.findMany({ where: { userId } });
  const byKey = new Map(overrides.map((o) => [o.moduleKey, o.allowed]));
  return MODULES.filter((m) => {
    const ov = byKey.get(m.key);
    if (ov !== undefined) return ov;         // override explicite (grant/deny)
    return m.roles.includes(role);           // sinon : défaut par rôle
  }).map((m) => m.key);
}

/** Un module est-il explicitement RETIRÉ à cet utilisateur ? (enforcement backend) */
export async function isModuleDenied(userId: string, moduleKey: string): Promise<boolean> {
  const ov = await prisma.userModuleAccess.findUnique({
    where: { userId_moduleKey: { userId, moduleKey } },
  });
  return ov ? ov.allowed === false : false;
}
