/**
 * Périmètre de travail — point d'application unique.
 *
 * Le cloisonnement était appliqué module par module, chacun à sa manière : six
 * modules le faisaient, une douzaine l'oubliaient. Un agent MISSION voyait donc
 * ses deux marchés dans une liste et les quatre de l'agence dans la suivante.
 *
 * Ce module fournit les trois formes dont les routes ont besoin. Les employer
 * plutôt que de réécrire la logique évite qu'un module reparte de zéro — et
 * l'oublie.
 *
 * Règle : seuls MISSION, TECHNIQUE et BAILLEUR sont scopés (cf. affectations.ts).
 * Pour eux, AUCUNE affectation = AUCUN accès. Les rôles centraux (DG, DAF, DMC,
 * ADMIN…) ne sont pas restreints et reçoivent `null`.
 */
import type { Request } from "express";
import { getMarchesAffectes } from "./affectations";
import { entrepriseIdOf } from "./scope";
import { ApiError } from "../middleware/error.middleware";

/** Marchés visibles par l'appelant, ou null s'il n'est pas restreint. */
export async function marchesAutorises(req: Request): Promise<string[] | null> {
  if (!req.user) return [];
  return getMarchesAffectes(req.user.id, req.user.role);
}

/**
 * Fragment `where` pour une table portant directement `marcheId`.
 * Renvoie `{}` si l'appelant n'est pas restreint — à étaler dans le where.
 */
export async function filtreParMarche(req: Request): Promise<Record<string, unknown>> {
  const autorises = await marchesAutorises(req);
  return autorises === null ? {} : { marcheId: { in: autorises } };
}

/**
 * Fragment `where` pour une table rattachée au marché VIA le décompte
 * (attachements, circuits financiers, signatures…).
 */
export async function filtreParDecompte(req: Request): Promise<Record<string, unknown>> {
  const autorises = await marchesAutorises(req);
  if (autorises === null) return {};
  return { decompte: { marcheId: { in: autorises } } };
}

/**
 * Contrôle d'un marché désigné dans l'URL.
 *
 * Ici on ne filtre pas : on refuse. Un identifiant hors périmètre doit
 * répondre « introuvable » — pas « interdit », qui confirmerait son existence.
 */
export async function assertMarcheAutorise(req: Request, marcheId: string): Promise<void> {
  const autorises = await marchesAutorises(req);
  if (autorises === null) return;
  if (!autorises.includes(marcheId)) throw new ApiError(404, "Marché introuvable");
}

/**
 * Contrôle d'un décompte désigné dans l'URL, via son marché.
 * `chargerMarcheId` évite d'importer Prisma ici et garde ce module pur.
 */
export async function assertDecompteAutorise(
  req: Request,
  decompteId: string,
  chargerMarcheId: (id: string) => Promise<string | null>,
): Promise<void> {
  const autorises = await marchesAutorises(req);
  if (autorises === null) return;
  const marcheId = await chargerMarcheId(decompteId);
  if (!marcheId || !autorises.includes(marcheId)) throw new ApiError(404, "Décompte introuvable");
}

/** Entreprise du compte ENTREPRISE, pour l'isolation des comptes externes. */
export async function entrepriseDuCompte(req: Request): Promise<string | null> {
  if (req.user?.role !== "ENTREPRISE") return null;
  return entrepriseIdOf(req.user.id);
}
