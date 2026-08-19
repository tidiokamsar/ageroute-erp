import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authStore } from "../lib/auth";
import { parseApiError } from "../lib/api";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { LogoAgeroute } from "../components/ui/LogoAgeroute";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authStore.login(email, password);
      navigate("/");
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #243660 60%, #1B2A4A 100%)" }}>
      {/* Fond subtil avec triangles décoratifs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg className="absolute -top-20 -right-20 opacity-5" width="400" height="400" viewBox="0 0 400 400">
          <polygon points="200,0 400,400 0,400" fill="#F0A500"/>
        </svg>
        <svg className="absolute -bottom-10 -left-10 opacity-5" width="300" height="300" viewBox="0 0 300 300">
          <polygon points="150,0 300,300 0,300" fill="#F0A500"/>
        </svg>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo + titre */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <LogoAgeroute taille={96} className="mx-auto drop-shadow-xl" />
          </div>
          <div className="flex items-baseline justify-center gap-0 mb-1">
            <span className="text-3xl font-black text-gold tracking-tight">AGE</span>
            <span className="text-3xl font-black text-white tracking-tight">ROUTE</span>
          </div>
          <p className="text-white/50 text-xs tracking-[0.2em] uppercase mt-1">
            Agence de Gestion des Routes — Guinée
          </p>
          <div className="h-px w-16 bg-gold/40 mx-auto my-3 rounded" />
          <p className="text-white/40 text-xs">Gestion des Marchés & e-Décomptes</p>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-navy mb-6 flex items-center gap-2">
            <span className="h-1 w-5 bg-gold rounded-full inline-block" />
            Connexion
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@ageroute.gov.gn" required autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Mot de passe</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          AGEROUTE Guinée — Direction des Systèmes d'Information
        </p>
      </div>
    </div>
  );
}
