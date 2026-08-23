/**
 * Fabrique des adaptateurs à partir de la configuration d'administration.
 * C'est le seul endroit qui connaît les implémentations concrètes.
 */
import type { ConfigurationSignature } from "./configuration";
import type { AdaptateurPrestataire, ServiceValidation } from "./interfaces";
import { AdaptateurSimule } from "./adaptateur-simule";
import { AdaptateurSignServer } from "./adaptateur-signserver";
import { ServiceValidationDss, ValidationAbsente } from "./validation-dss";

export function fabriquerPrestataire(cfg: ConfigurationSignature): AdaptateurPrestataire {
  if (cfg.prestataireType === "signserver") {
    return new AdaptateurSignServer({
      url: cfg.prestataireUrl,
      worker: cfg.prestataireWorker,
      auth: cfg.prestataireAuth,
      laboratoire: cfg.mode !== "provider",
    });
  }
  return new AdaptateurSimule();
}

export function fabriquerValidation(cfg: ConfigurationSignature): ServiceValidation {
  return cfg.dssUrl ? new ServiceValidationDss(cfg.dssUrl) : new ValidationAbsente();
}
