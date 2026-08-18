/**
 * Lot L2.2 — Chargement des étiquettes paramétrées (A9).
 *
 * Une seule requête pour toute l'application, mise en cache longuement : les
 * libellés changent au rythme des décisions de l'agence, pas des écrans.
 * En cas d'échec, le hook renvoie un objet vide et l'affichage retombe sur les
 * libellés livrés — jamais d'écran vide parce qu'une règle est injoignable.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { parserEtiquettes, type Etiquettes } from "./etiquettes";

export function useEtiquettes(): Etiquettes {
  const { data } = useQuery<Etiquettes>({
    queryKey: ["etiquettes"],
    queryFn: async () => {
      const reponse = await api.get<{ regles: { ETQ_MAPPINGS?: string } }>("/parametrage/regles/effectives");
      return parserEtiquettes(reponse.data?.regles?.ETQ_MAPPINGS);
    },
    staleTime: 15 * 60 * 1000,
    retry: false,
    // Les libellés livrés suffisent tant que la réponse n'est pas là.
    placeholderData: {},
  });
  return data ?? {};
}
