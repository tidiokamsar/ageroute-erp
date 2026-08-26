import { Prisma, type TypeDecompte } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { serializeForJson } from "../../lib/bigint";
import { ApiError } from "../../middleware/error.middleware";
import { chargerRegles } from "../../lib/regles";
import { calcDecompteRegles } from "../decomptes/decomptes.calc.regles";
import { construireSnapshot } from "../decomptes/decomptes.regles.audit";
import { assertEntrepriseConforme } from "../conformite/conformite.service";
import type { PortailDecompteRequest } from "./portail.decompte.schema";

const TYPE_DECOMPTE_MAP: Record<PortailDecompteRequest["type"], TypeDecompte> = {
  PARTIEL: "PARTIEL",
  DEFINITIF: "FINAL",
  AVANCE: "AVANCE",
  REGULARISATION: "APRES_AVENANT",
};

const TYPE_REFERENCE_MAP: Record<PortailDecompteRequest["type"], string> = {
  PARTIEL: "DP",
  DEFINITIF: "DD",
  AVANCE: "DA",
  REGULARISATION: "DR",
};

const DOCUMENT_TYPE_MAP: Record<PortailDecompteRequest["pieces"][number]["type"], string> = {
  DECOMPTE: "decompteSigné",
  ATTACHEMENT: "attachements",
  FACTURE: "facture",
  RAPPORT_AVANCEMENT: "rapportAvancement",
  PHOTO: "photosChantier",
  PV: "pvContradictoire",
};
const STATUTS_MARCHE_ACTIFS = [
  "SIGNE",
  "NOTIFIE",
  "EN_EXECUTION",
  "EN_AVENANT",
  "EN_RECEPTION_PROVISOIRE",
  "ACTIF",
] as const;

const STATUTS_ENTREPRISE_ELIGIBLES = ["CONFORME", "AUTORISE"] as const;

function decimalPositifVersFraction(value: number): { numerateur: bigint; denominateur: bigint } {
  const [coefficient, exposantTexte] = value.toString().toLowerCase().split("e");
  const exposant = exposantTexte ? Number(exposantTexte) : 0;
  const [entier, fraction = ""] = coefficient.split(".");
  const chiffres = BigInt(entier + fraction);
  const echelle = fraction.length - exposant;

  if (echelle <= 0) {
    return { numerateur: chiffres * (10n ** BigInt(-echelle)), denominateur: 1n };
  }
  return { numerateur: chiffres, denominateur: 10n ** BigInt(echelle) };
}

/**
 * Reproduit Math.round(quantite × prixUnitaire) pour des valeurs positives,
 * sans convertir le montant GNF en nombre flottant.
 */
export function calculerMontantLigneGnf(quantite: number, prixUnitaire: number): bigint {
  if (!Number.isFinite(quantite) || quantite <= 0) {
    throw new RangeError("La quantité doit être un nombre fini strictement positif");
  }
  if (!Number.isSafeInteger(prixUnitaire) || prixUnitaire <= 0) {
    throw new RangeError("Le prix unitaire doit être un entier GNF positif et sûr");
  }

  const { numerateur, denominateur } = decimalPositifVersFraction(quantite);
  const produit = numerateur * BigInt(prixUnitaire);
  return (produit + denominateur / 2n) / denominateur;
}

async function verifierConformiteExistante(entrepriseId: string): Promise<void> {
  try {
    await assertEntrepriseConforme(entrepriseId);
  } catch (error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const message = (error as { message?: unknown }).message;
    if (typeof statusCode === "number" && typeof message === "string") {
      throw new ApiError(statusCode, message);
    }
    throw error;
  }
}

export async function creerBrouillonDecomptePortail(params: {
  data: PortailDecompteRequest;
  entrepriseId: string;
  userId: string;
  ipAddress?: string;
}) {
  await verifierConformiteExistante(params.entrepriseId);

  const lignes = params.data.lignes.map((ligne, index) => {
    const montantBrut = calculerMontantLigneGnf(ligne.quantite, ligne.prixUnitaire);
    if (montantBrut <= 0n) {
      throw new ApiError(400, "La ligne " + (index + 1) + " produit un montant nul");
    }
    return { ...ligne, montantBrut };
  });
  const montantPeriodeHtGnf = lignes.reduce((total, ligne) => total + ligne.montantBrut, 0n);

  try {
    return await prisma.$transaction(async (tx) => {
      const marche = await tx.marche.findFirst({
        where: {
          id: params.data.marcheId,
          entrepriseId: params.entrepriseId,
          deletedAt: null,
        },
        select: {
          id: true,
          reference: true,
          statut: true,
          montantInitialGnf: true,
          montantActualiseGnf: true,
          montantAvanceGnf: true,
          avanceComplementaireGnf: true,
          tauxTva: true,
          tauxRetenueGarantie: true,
          tauxAvance: true,
          financement: true,
          type: true,
          entreprise: {
            select: {
              statut: true,
              estRadie: true,
              estSuspendu: true,
              estInterditSoumission: true,
              autoriseContracterEtat: true,
            },
          },
        },
      });
      if (!marche) {
        throw new ApiError(403, "Marché non trouvé ou non accessible");
      }
      if (!(STATUTS_MARCHE_ACTIFS as readonly string[]).includes(marche.statut)) {
        throw new ApiError(400, "Brouillon impossible : marché non actif (" + marche.statut + ")");
      }
      if (
        !(STATUTS_ENTREPRISE_ELIGIBLES as readonly string[]).includes(marche.entreprise.statut)
        || marche.entreprise.estRadie
        || marche.entreprise.estSuspendu
        || marche.entreprise.estInterditSoumission
        || !marche.entreprise.autoriseContracterEtat
      ) {
        throw new ApiError(403, "BLOCAGE CONFORMITÉ — l’entreprise n’est pas éligible au dépôt d’un décompte");
      }

      const annee = new Date().getFullYear();
      const [montantsExistants, avanceRecuperee, pieceDejaRattachee, nbExistants, dossierCount] = await Promise.all([
        tx.decompte.aggregate({
          where: {
            marcheId: marche.id,
            deletedAt: null,
            statut: { not: "REJETE" },
          },
          _sum: { montantPeriodeHtGnf: true },
        }),
        tx.decompte.aggregate({
          where: {
            marcheId: marche.id,
            deletedAt: null,
            statut: { not: "REJETE" },
          },
          _sum: { avanceRecuperee: true },
        }),
        tx.document.findFirst({
          where: { cheminFichier: { in: params.data.pieces.map((piece) => piece.cheminFichier) } },
          select: { id: true },
        }),
        tx.decompte.count({ where: { marcheId: marche.id } }),
        tx.decompte.count({
          where: { numeroDossier: { startsWith: "ED-" + annee + "-" } },
        }),
      ]);

      if (pieceDejaRattachee) {
        throw new ApiError(409, "Une pièce du dossier est déjà rattachée à un autre décompte");
      }

      const montantContrat = marche.montantActualiseGnf ?? marche.montantInitialGnf;
      const cumulPrecedentHtGnf = montantsExistants._sum.montantPeriodeHtGnf ?? 0n;
      const cumulHt = cumulPrecedentHtGnf + montantPeriodeHtGnf;
      if (montantContrat <= 0n || cumulHt > montantContrat) {
        throw new ApiError(
          400,
          "Plafond du marché dépassé : cumul HT " + cumulHt.toString()
            + " GNF, plafond " + montantContrat.toString() + " GNF",
        );
      }

      const totalAvance = marche.montantAvanceGnf + marche.avanceComplementaireGnf;
      const avanceRestanteGnf = totalAvance - (avanceRecuperee._sum.avanceRecuperee ?? 0n);
      const regles = await chargerRegles({
        marcheId: marche.id,
        bailleur: marche.financement,
        typeMarche: marche.type,
      });
      const calculated = calcDecompteRegles({
        montantPeriodeHtGnf,
        cumulPrecedentHtGnf,
        tauxTva: marche.tauxTva,
        tauxRetenueGarantie: marche.tauxRetenueGarantie,
        tauxAvance: marche.tauxAvance,
        avanceRestanteGnf,
      }, regles);
      const reglesSnapshot = construireSnapshot(regles, "GLOBAL");
      if (calculated.netAPayer < 0n) {
        throw new ApiError(
          400,
          "Le calcul aboutit à un net à payer négatif. Le brouillon doit être revu par la DAF avant enregistrement.",
        );
      }

      const numero = String(nbExistants + 1).padStart(2, "0");
      const reference = marche.reference + "-" + TYPE_REFERENCE_MAP[params.data.type] + "-" + numero;
      const numeroDossier = "ED-" + annee + "-" + String(dossierCount + 1).padStart(4, "0");

      const decompte = await tx.decompte.create({
        data: {
          reference,
          numeroDossier,
          type: TYPE_DECOMPTE_MAP[params.data.type],
          statut: "BROUILLON",
          marcheId: marche.id,
          entrepriseId: params.entrepriseId,
          observations: params.data.observations,
          montantPeriodeHtGnf,
          cumulPrecedentHtGnf,
          cumulActuelHtGnf: calculated.cumulActuelHtGnf,
          tva: calculated.tva,
          montantArmpGnf: calculated.montantArmpGnf,
          montantTtcGnf: calculated.montantTtcGnf,
          precompteTvaGnf: calculated.precompteTvaGnf,
          retenueGarantie: calculated.retenueGarantie,
          avanceRecuperee: calculated.avanceRecuperee,
          netAPayer: calculated.netAPayer,
          reglesSnapshot: reglesSnapshot as never,
          piecesObligatoires: {
            decompteSigné: true,
            attachements: true,
            facture: true,
            rapportAvancement: true,
            photosChantier: params.data.pieces.some((piece) => piece.type === "PHOTO"),
            pvContradictoire: params.data.pieces.some((piece) => piece.type === "PV"),
          },
          documents: {
            create: params.data.pieces.map((piece) => ({
              type: DOCUMENT_TYPE_MAP[piece.type],
              nom: piece.nom,
              description: piece.legende || undefined,
              cheminFichier: piece.cheminFichier,
              mimeType: piece.mimeType,
              tailleOctets: piece.tailleOctets,
              uploadePar: params.userId,
            })),
          },
          lignesDecompte: {
            create: lignes.map((ligne, index) => ({
              codeArticle: "PORTAIL-" + String(index + 1).padStart(3, "0"),
              designation: ligne.designation,
              unite: ligne.unite,
              quantiteContrat: ligne.quantite,
              quantiteCourante: ligne.quantite,
              quantiteCumulee: ligne.quantite,
              prixUnitaire: BigInt(ligne.prixUnitaire),
              montantBrut: ligne.montantBrut,
              statut: "BROUILLON",
            })),
          },
        },
        include: { documents: true, lignesDecompte: true },
      });

      await tx.auditLog.create({
        data: {
          userId: params.userId,
          action: "CREATE",
          entityType: "Decompte",
          entityId: decompte.id,
          after: serializeForJson({
            id: decompte.id,
            reference: decompte.reference,
            statut: decompte.statut,
            marcheId: decompte.marcheId,
            entrepriseId: decompte.entrepriseId,
            montantPeriodeHtGnf: decompte.montantPeriodeHtGnf,
            documents: decompte.documents.map((document) => document.id),
            lignes: decompte.lignesDecompte.length,
          }) as Prisma.InputJsonValue,
          ipAddress: params.ipAddress,
        },
      });

      return decompte;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ApiError(409, "Un autre brouillon a été enregistré simultanément. Veuillez réessayer.");
    }
    throw error;
  }
}
