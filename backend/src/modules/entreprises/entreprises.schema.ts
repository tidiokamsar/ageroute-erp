import { z } from "zod";

export const entrepriseCreateSchema = z.object({
  raisonSociale:           z.string().min(1),
  sigle:                   z.string().optional(),
  formeJuridique:          z.string().optional(),
  nif:                     z.string().min(1),
  numerotva:               z.string().optional(),
  rccm:                    z.string().optional(),
  dateCreation:            z.string().optional(),
  adresse:                 z.string().optional(),
  ville:                   z.string().optional(),
  commune:                 z.string().optional(),
  telephone:               z.string().optional(),
  email:                   z.string().email().optional().or(z.literal("")),
  siteWeb:                 z.string().optional(),
  dirigeant:               z.string().optional(),
  representantLegal:       z.string().optional(),
  qualiteRepresentant:     z.string().optional(),
  agrement:                z.string().optional(),
  categorieAgrement:       z.string().optional(),
  classement:              z.string().optional(),
  domainesCompetence:      z.array(z.string()).optional(),
  iban:                    z.string().optional(),
  nomBanque:               z.string().optional(),
  codeBanque:              z.string().optional(),
  regimeFiscal:            z.string().optional(),
  assujettTVA:             z.boolean().optional(),
  regulariteFiscale:       z.boolean().optional(),
  attestationFiscaleNum:   z.string().optional(),
  attestationFiscaleExpire:z.string().optional(),
  regulariteSociale:       z.boolean().optional(),
  attestationSocialeNum:   z.string().optional(),
  attestationSocialeExpire:z.string().optional(),
  attestationValide:       z.boolean().optional(),
  cautionBancaire:         z.boolean().optional(),
  estRadie:                z.boolean().optional(),
  estSuspendu:             z.boolean().optional(),
  estInterditSoumission:   z.boolean().optional(),
  autoriseContracterEtat:  z.boolean().optional(),
  motifBlocage:            z.string().optional(),
});

export const entrepriseUpdateSchema = entrepriseCreateSchema.partial();

export const documentSchema = z.object({
  type:           z.string().min(1),
  libelle:        z.string().optional(),
  numero:         z.string().optional(),
  url:            z.string().optional(),
  dateEmission:   z.string().optional(),
  dateExpiration: z.string().optional(),
  observations:   z.string().optional(),
});

export const contactSchema = z.object({
  nom:       z.string().min(1),
  prenom:    z.string().optional(),
  fonction:  z.string().optional(),
  telephone: z.string().optional(),
  email:     z.string().email().optional().or(z.literal("")),
  principal: z.boolean().optional(),
});

export type EntrepriseCreateInput = z.infer<typeof entrepriseCreateSchema>;
