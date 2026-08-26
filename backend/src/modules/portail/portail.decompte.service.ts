/**
 * Arithmétique monétaire du dépôt portail.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE
 * Le montant d'un décompte déposé par le portail était la somme des
 * `montantBrut` calculés par le NAVIGATEUR : le serveur les additionnait tels
 * quels. Le montant engagé dépendait donc du client. Ici, le serveur recalcule
 * chaque ligne à partir de la quantité et du prix unitaire, en arithmétique
 * entière — jamais de multiplication flottante sur des francs guinéens.
 *
 * Ce fichier ne portait initialement qu'une fonction utile parmi un flux de
 * création de brouillon. Ce flux a été écarté à l'intégration : le dépôt du
 * portail entre directement dans le circuit unifié (statut DEPOSE), décision
 * de la revue du 26/08/2026 déjà en production. Seul le calcul est conservé.
 */

/** Décompose un décimal positif en fraction exacte, sans passer par un flottant. */
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
 * Montant d'une ligne en francs : quantité × prix unitaire, arrondi au franc
 * le plus proche. Reproduit `Math.round(quantite × prixUnitaire)` pour des
 * valeurs positives, sans jamais convertir le montant en nombre flottant.
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
