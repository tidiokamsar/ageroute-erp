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
  { key: "dashboard",    label: "Tableau de bord",       roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","MISSION","TECHNIQUE","AUDITEUR","BAILLEUR","BUDGET","TRESOR","FER_AGT","BCRG"] },
  { key: "bi",           label: "BI & Reporting",        roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","BAILLEUR"] },
  { key: "projets",      label: "Projets",               roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","AUDITEUR"] },
  { key: "entreprises",  label: "Entreprises",           roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","AUDITEUR"] },
  { key: "marches",      label: "Marchés",               roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET","AUDITEUR"] },
  { key: "avenants",     label: "Avenants",              roles: ["ADMIN","DG","DAF","DMC","UGP","AUDITEUR"] },
  { key: "decomptes",    label: "e-Décomptes",           roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR","BUDGET","TRESOR","BCRG","FER_AGT","ENTREPRISE","AUDITEUR"] },
  { key: "attachements", label: "Attachements",          roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","ENTREPRISE","AUDITEUR"] },
  { key: "workflow",     label: "Mes tâches",            roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BUDGET","TRESOR","BCRG","FER_AGT"] },
  { key: "garanties",    label: "Garanties",             roles: ["ADMIN","DG","DAF","DSF","DMC","UGP","MISSION","AUDITEUR"] },
  { key: "receptions",   label: "Réceptions / PV",       roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","ENTREPRISE","AUDITEUR"] },
  { key: "revision",     label: "Révision de prix",      roles: ["ADMIN","DG","DAF","DMC","UGP","AUDITEUR"] },
  { key: "delegations",  label: "Délégations d'intérim", roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"] },
  { key: "financier",    label: "Circuit paiement",      roles: ["ADMIN","DG","DAF","DSF","BUDGET","TRESOR","FER_AGT","BCRG","AUDITEUR"] },
  { key: "financements", label: "Financements",          roles: ["ADMIN","DG","DAF","DSF","BAILLEUR","BUDGET","AUDITEUR"] },
  // BCRG ajouté le 22/08/2026 : depuis le lot P0, la confirmation bancaire
  // (POST /paiements/:id/confirmation-bcrg) est l'UNIQUE voie vers PAYE, et le
  // contrôle par module est fail-closed. Sans cette ligne, la Banque Centrale
  // était exclue du module qui porte sa seule action — et aucun décompte ne
  // pouvait plus être payé hors ADMIN.
  { key: "paiements",    label: "Paiements",             roles: ["ADMIN","DG","DAF","DSF","BUDGET","TRESOR","BCRG","AUDITEUR"] },
  { key: "routier",      label: "Référentiel routier",   roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE","BAILLEUR"] },
  { key: "audit",        label: "Journal d'audit",       roles: ["ADMIN","DG","DAF","DMC","AUDITEUR"] },
  // TECHNIQUE ajouté le 23/08/2026 : la Direction technique signe la 2e étape
  // de TOUS les circuits, mais le catalogue fail-closed lui fermait le module
  // — constaté lors de la preuve de bout en bout : le signataire MISSION
  // passait, le signataire TECHNIQUE recevait 403 avant même la route.
  { key: "signatures",   label: "Signature électronique",roles: ["ADMIN","DG","DAF","DMC","UGP","MISSION","TECHNIQUE"] },
  { key: "utilisateurs", label: "Utilisateurs",          roles: ["ADMIN"] },
  { key: "parametrage",  label: "Paramétrage",           roles: ["ADMIN"] },
];

/**
 * AUDITEUR — décision D2 du 23/08/2026 (Abdoul Karim BAH). Depuis le contrôle
 * fail-closed, un rôle absent d'un module n'en atteint AUCUNE route : l'auditeur
 * ne voyait plus que le tableau de bord et le journal, et sa propre route
 * /decomptes/:id/recalcul-audit lui était fermée. Il est ajouté EN LECTURE aux
 * modules métier : les écritures restent gardées par les requireRole des
 * routes, qui ne le citent nulle part.
 */
export const MODULE_KEYS = MODULES.map((m) => m.key);

/**
 * DSF — Direction de la Structuration Financière. Rôle de consultation et de
 * suivi financier, créé le 20/08/2026. Volontairement HORS CIRCUIT :
 *
 *  - il n'est inscrit dans aucune des 11 définitions de workflow ;
 *  - il n'est pas dans `ROLES_SCOPES` (lib/affectations.ts) : sa visibilité
 *    n'est pas restreinte à des marchés affectés ;
 *  - aucune route ne l'autorise à valider, signer ou payer. Les modules
 *    ci-dessus lui sont ouverts en LECTURE par ce seul fait : c'est le
 *    `requireRole` de chaque route qui accorde l'action, et aucune ne le cite.
 *
 * Les modules « workflow » (Mes tâches), « audit », « utilisateurs » et
 * « parametrage » lui restent fermés. Un besoin ponctuel se traite par un
 * octroi individuel dans `user_module_access`, sans toucher ce catalogue.
 */
export const ROLE_DSF_HORS_CIRCUIT = true;

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
