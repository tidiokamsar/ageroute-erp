import "./lib/bigint";
import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`ERP AGEROUTE backend démarré sur le port ${env.PORT} [${env.NODE_ENV}]`);
});
