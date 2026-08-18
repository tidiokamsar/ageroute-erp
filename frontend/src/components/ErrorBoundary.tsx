/**
 * Barrière d'erreur React — sans elle, une exception au rendu d'une page
 * laisse un écran blanc sans recours. Affiche un message français et un
 * bouton de rechargement ; journalise l'erreur en console.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";

interface Props { children: ReactNode; }
interface State { erreur: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("[ERP] Erreur de rendu :", erreur, info.componentStack);
  }

  render() {
    if (this.state.erreur) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <AlertOctagon size={40} className="mx-auto text-red-400 mb-4" />
            <h1 className="text-lg font-semibold text-gray-800 mb-2">Une erreur inattendue est survenue</h1>
            <p className="text-sm text-gray-500 mb-1">
              La page n'a pas pu s'afficher complètement. Vos données ne sont pas affectées.
            </p>
            <p className="text-xs text-gray-400 mb-6 font-mono break-all">{this.state.erreur.message}</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => this.setState({ erreur: null })}
                className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-sm px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy/90"
              >
                Recharger l'application
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
