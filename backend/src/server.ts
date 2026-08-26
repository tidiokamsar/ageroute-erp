import "./lib/bigint";
import { createApp } from "./app";
import { env } from "./config/env";
import { verifierStockageInscriptible } from "./lib/verifier-stockage";

// Le stockage des pièces est vérifié AVANT d'écouter : un backend qui répond
// « ok » sur /api/health mais ne peut rien écrire est pire qu'un backend arrêté.
verifierStockageInscriptible(env.UPLOAD_DIR);

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`ERP AGEROUTE backend démarré sur le port ${env.PORT} [${env.NODE_ENV}]`);
});
