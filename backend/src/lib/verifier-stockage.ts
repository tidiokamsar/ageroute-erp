import { accessSync, constants, mkdirSync } from "node:fs";

/**
 * Contrôle que le répertoire des pièces jointes est réellement inscriptible.
 *
 * ⚠️ POURQUOI CE CONTRÔLE EXISTE
 * Le conteneur backend s'exécute sous l'utilisateur `node` (uid 1000), alors
 * que le volume `erp_uploads` a été créé et peuplé par une image antérieure
 * tournant en root. Un `chown` posé dans le Dockerfile ne s'applique QU'À
 * L'IMAGE : un volume déjà peuplé garde ses propriétaires. Résultat, toute
 * écriture échoue en EACCES.
 *
 * Le piège tient à ce que rien ne le signalait : `mkdirSync(..., recursive)`
 * ne fait rien sur un répertoire existant, le serveur démarrait, la sonde de
 * santé répondait — et la panne n'apparaissait qu'au premier téléversement
 * d'un utilisateur, longtemps après que le déploiement eut été validé.
 *
 * Mieux vaut refuser de démarrer, avec le geste de réparation dans le message.
 */
export function verifierStockageInscriptible(repertoire: string): void {
  try {
    mkdirSync(repertoire, { recursive: true });
    accessSync(repertoire, constants.W_OK);
  } catch (err) {
    const cause = (err as NodeJS.ErrnoException).code ?? "inconnue";
    throw new Error(
      `Le répertoire des pièces jointes « ${repertoire} » n'est pas inscriptible (${cause}).\n` +
      "Le service refuse de démarrer : sans ce répertoire, tout téléversement échouerait\n" +
      "silencieusement alors que la sonde de santé resterait au vert.\n" +
      "Si le conteneur tourne sous l'utilisateur node (uid 1000) et que le volume a été\n" +
      "créé par une image antérieure exécutée en root, reprendre la propriété une fois :\n" +
      "  docker run --rm -v erp-ageroute_erp_uploads:/v alpine chown -R 1000:1000 /v",
    );
  }
}
