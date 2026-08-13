/**
 * Recherche globale — champ unique dans l'en-tête : marchés, décomptes,
 * attachements, entreprises. Résultats cliquables (liens profonds).
 */
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { Search } from "lucide-react";

interface Results {
  marches: { id: string; reference: string; intitule: string; statut: string }[];
  decomptes: { id: string; reference: string; numeroDossier?: string; statut: string; entreprise?: { raisonSociale: string } }[];
  attachements: { id: string; code?: string; statut: string; decompte?: { reference: string } }[];
  entreprises: { id: string; raisonSociale: string; nif?: string; statut: string }[];
}

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => {
      api.get("/search", { params: { q } })
        .then((r) => { setRes(r.data); setOpen(true); })
        .catch(() => setRes(null));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const total = res ? res.marches.length + res.decomptes.length + res.attachements.length + res.entreprises.length : 0;

  const Section = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase px-3 pt-2 pb-1">{titre}</p>
      {children}
    </div>
  );
  const Item = ({ href, main, sub, statut }: { href: string; main: string; sub?: string; statut?: string }) => (
    <a href={href} className="flex items-center justify-between px-3 py-1.5 hover:bg-navy/5 transition-colors">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-navy truncate">{main}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
      {statut && <span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0 ml-2">{statut}</span>}
    </a>
  );

  return (
    <div ref={boxRef} className="relative hidden sm:block w-64 md:w-80">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"/>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (res) setOpen(true); }}
          placeholder="Rechercher marché, décompte, entreprise..."
          className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:ring-2 focus:ring-navy/20 focus:border-navy/30 outline-none"
        />
      </div>
      {open && res && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-[70vh] overflow-auto pb-2">
          {total === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucun résultat pour « {q} »</p>}
          {res.decomptes.length > 0 && (
            <Section titre="Décomptes">
              {res.decomptes.map((d) => (
                <Item key={d.id} href={`/decomptes?id=${d.id}`} main={d.reference} sub={`${d.numeroDossier ?? ""} ${d.entreprise?.raisonSociale ?? ""}`} statut={d.statut}/>
              ))}
            </Section>
          )}
          {res.attachements.length > 0 && (
            <Section titre="Attachements">
              {res.attachements.map((a) => (
                <Item key={a.id} href={`/attachements?id=${a.id}`} main={a.code ?? "ATT"} sub={a.decompte?.reference} statut={a.statut}/>
              ))}
            </Section>
          )}
          {res.marches.length > 0 && (
            <Section titre="Marchés">
              {res.marches.map((mm) => (
                <Item key={mm.id} href="/marches" main={mm.reference} sub={mm.intitule} statut={mm.statut}/>
              ))}
            </Section>
          )}
          {res.entreprises.length > 0 && (
            <Section titre="Entreprises">
              {res.entreprises.map((e) => (
                <Item key={e.id} href="/entreprises" main={e.raisonSociale} sub={e.nif} statut={e.statut}/>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
