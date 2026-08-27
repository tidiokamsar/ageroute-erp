/**
 * Tests — bornes de l'acte de délégation (revue du 27/08/2026).
 * Chaque cas correspond à une délégation que l'ERP acceptait avant ce lot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLES_DEFAUT, type ReglesEffectives } from "./regles";
import {
  verifierDelegation, periodesSeChevauchent, dureeMaxJours, rolesNonDelegables, fermeUneBoucle,
  type DemandeDelegation, type DelegationExistante,
} from "./delegations.regles";

const REGLES = { ...REGLES_DEFAUT } as unknown as ReglesEffectives;
const MAINTENANT = new Date("2026-09-01T08:00:00Z");
const j = (n: number) => new Date(MAINTENANT.getTime() + n * 24 * 3600 * 1000);

function demande(over: Partial<DemandeDelegation> = {}): DemandeDelegation {
  return {
    titulaire: { id: "daf", role: "DAF", actif: true },
    suppleant: { id: "dmc", role: "DMC", actif: true },
    dateDebut: j(0),
    dateFin: j(14),
    motif: "Congé annuel du DAF, note de service 2026-114",
    existantes: [],
    regles: REGLES,
    maintenant: MAINTENANT,
    ...over,
  };
}

function existante(over: Partial<DelegationExistante> = {}): DelegationExistante {
  return { id: "d1", titulaireId: "daf", suppleantId: "ugp", dateDebut: j(5), dateFin: j(20), actif: true, ...over };
}

test("une délégation d intérim normale est acceptée", () => {
  assert.deepEqual(verifierDelegation(demande()), { autorise: true });
});

test("un compte ENTREPRISE ne peut pas recevoir le pouvoir d un agent", () => {
  // Le défaut le plus lourd : rien n'empêchait un DAF de déléguer son visa à
  // l'attributaire du marché, qui portait alors le rôle DAF dans le workflow.
  const v = verifierDelegation(demande({ suppleant: { id: "ese", role: "ENTREPRISE", actif: true } }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "SUPPLEANT_INELIGIBLE");
});

test("le rôle ADMIN est refusé à la création, pas neutralisé après coup", () => {
  // porteeRoles() filtrait ADMIN en aval : l'acte était accepté, affiché,
  // audité — et sans effet. Une délégation qui ne délègue rien est un leurre.
  const v = verifierDelegation(demande({ titulaire: { id: "adm", role: "ADMIN", actif: true } }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "ROLE_NON_DELEGABLE");
});

test("les organismes tiers du circuit financier ne se délèguent pas ici", () => {
  for (const role of ["BCRG", "TRESOR", "BUDGET", "FER_AGT", "BAILLEUR"]) {
    const v = verifierDelegation(demande({ titulaire: { id: "x", role, actif: true } }));
    assert.equal(v.autorise, false, `${role} ne devrait pas être délégable`);
    assert.equal(v.code, "ROLE_NON_DELEGABLE");
  }
});

test("un compte désactivé ne délègue ni ne reçoit", () => {
  assert.equal(verifierDelegation(demande({ titulaire: { id: "daf", role: "DAF", actif: false } })).code, "TITULAIRE_INACTIF");
  assert.equal(verifierDelegation(demande({ suppleant: { id: "dmc", role: "DMC", actif: false } })).code, "SUPPLEANT_INACTIF");
});

test("une délégation ne prend pas effet dans le passé", () => {
  // Antidater aurait légitimé après coup des validations déjà posées.
  const v = verifierDelegation(demande({ dateDebut: j(-3), dateFin: j(10) }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "ANTIDATEE");
});

test("le jour même reste acceptable — c est le cas d usage de l intérim", () => {
  assert.equal(verifierDelegation(demande({ dateDebut: new Date("2026-09-01T18:00:00Z") })).autorise, true);
});

test("une délégation qui court jusqu en 2099 est refusée", () => {
  const v = verifierDelegation(demande({ dateFin: new Date("2099-12-31T00:00:00Z") }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "DUREE_EXCESSIVE");
  assert.match(v.motif ?? "", /90 jours/);
});

test("la durée maximale suit le paramétrage", () => {
  const regles = { ...REGLES, WF_DELEGATION_DUREE_MAX_JOURS: "15" };
  assert.equal(verifierDelegation(demande({ regles })).autorise, true); // 14 jours
  assert.equal(verifierDelegation(demande({ regles, dateFin: j(30) })).code, "DUREE_EXCESSIVE");
  assert.equal(dureeMaxJours(REGLES), 90);
  assert.equal(dureeMaxJours({ ...REGLES, WF_DELEGATION_DUREE_MAX_JOURS: "abc" }), 90);
});

test("un acte de délégation se justifie : le motif est obligatoire", () => {
  assert.equal(verifierDelegation(demande({ motif: undefined })).code, "MOTIF_MANQUANT");
  assert.equal(verifierDelegation(demande({ motif: "  absence  " })).code, "MOTIF_MANQUANT");
});

test("deux suppléants ne portent pas le même pouvoir en même temps", () => {
  const v = verifierDelegation(demande({ existantes: [existante()] }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "CHEVAUCHEMENT");
});

test("une délégation antérieure révoquée ou disjointe ne bloque rien", () => {
  assert.equal(verifierDelegation(demande({ existantes: [existante({ actif: false })] })).autorise, true);
  assert.equal(verifierDelegation(demande({ existantes: [existante({ dateDebut: j(60), dateFin: j(70) })] })).autorise, true);
});

test("A délègue à B pendant que B délègue à A : refusé", () => {
  // Chacun porterait le rôle de l'autre — les deux sont donc présents, et la
  // notion même d'intérim disparaît.
  const v = verifierDelegation(demande({
    existantes: [existante({ titulaireId: "dmc", suppleantId: "daf", dateDebut: j(2), dateFin: j(9) })],
  }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "RECIPROQUE");
});

test("le suppléant peut recevoir de deux titulaires différents", () => {
  // Cumuler deux intérims est lourd mais légitime ; RG9 empêche de son côté
  // qu'une même personne valide deux étapes du même dossier.
  const v = verifierDelegation(demande({
    existantes: [existante({ titulaireId: "dg", suppleantId: "dmc", dateDebut: j(2), dateFin: j(9) })],
  }));
  assert.equal(v.autorise, true);
});

test("se déléguer à soi-même reste refusé", () => {
  assert.equal(verifierDelegation(demande({ suppleant: { id: "daf", role: "DAF", actif: true } })).code, "MEME_PERSONNE");
});

test("le chevauchement se calcule bornes incluses", () => {
  const a = { dateDebut: j(0), dateFin: j(10) };
  assert.equal(periodesSeChevauchent(a, { dateDebut: j(10), dateFin: j(20) }), true);
  assert.equal(periodesSeChevauchent(a, { dateDebut: j(11), dateFin: j(20) }), false);
  assert.equal(periodesSeChevauchent(a, { dateDebut: j(-5), dateFin: j(0) }), true);
});

test("les rôles internes de l Agence restent délégables", () => {
  const interdits = rolesNonDelegables(REGLES);
  for (const role of ["DG", "DAF", "DMC", "UGP", "MISSION", "TECHNIQUE", "AUDITEUR", "DSF"]) {
    assert.equal(interdits.includes(role), false, `${role} doit rester délégable`);
  }
});

test("une boucle indirecte est détectée : A -> B -> C -> A", () => {
  // Chacun fait suivre un pouvoir que plus personne ne détient à la source.
  // La réciprocité directe n'en est que le cas le plus court.
  const v = verifierDelegation(demande({
    titulaire: { id: "A", role: "DAF", actif: true },
    suppleant: { id: "B", role: "DMC", actif: true },
    existantes: [
      existante({ id: "e1", titulaireId: "B", suppleantId: "C", dateDebut: j(40), dateFin: j(50) }),
      existante({ id: "e2", titulaireId: "C", suppleantId: "A", dateDebut: j(40), dateFin: j(50) }),
    ],
  }));
  assert.equal(v.autorise, false);
  assert.equal(v.code, "CYCLE");
});

test("une chaîne qui ne revient pas au titulaire reste permise", () => {
  const v = verifierDelegation(demande({
    titulaire: { id: "A", role: "DAF", actif: true },
    suppleant: { id: "B", role: "DMC", actif: true },
    existantes: [existante({ id: "e1", titulaireId: "B", suppleantId: "C", dateDebut: j(40), dateFin: j(50) })],
  }));
  assert.equal(v.autorise, true);
});

test("le parcours de boucle ne tourne pas en rond sur un graphe déjà cyclique", () => {
  // Robustesse : si la base contient déjà un cycle (données antérieures aux
  // contrôles), le parcours doit s'arrêter, pas boucler indéfiniment.
  const graphe = [
    existante({ id: "e1", titulaireId: "X", suppleantId: "Y" }),
    existante({ id: "e2", titulaireId: "Y", suppleantId: "X" }),
  ];
  assert.equal(fermeUneBoucle(graphe, "Z", "X"), false);
  assert.equal(fermeUneBoucle(graphe, "X", "Y"), true);
});

test("une délégation révoquée ne compte pas dans le graphe", () => {
  const graphe = [existante({ id: "e1", titulaireId: "B", suppleantId: "A", actif: false })];
  assert.equal(fermeUneBoucle(graphe, "A", "B"), false);
});
