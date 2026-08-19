/**
 * Logo officiel AGEROUTE.
 *
 * L'emblème est bleu marine sur fond blanc. Or la page de connexion et la
 * barre latérale sont elles-mêmes bleu marine : posé en transparence, le
 * triangle disparaîtrait dans le fond. Plutôt que de recolorier un emblème
 * officiel — ce qui ne relève pas d'un choix technique — on le pose sur un
 * cartouche blanc dès que le fond est sombre.
 *
 * Le fichier servi fait 102 Ko (512 px) au lieu des 4,8 Mo et 16 667 px de
 * l'original, qui reste réservé à l'impression des documents.
 */
import { clsx } from "clsx";

export function LogoAgeroute({
  taille = 44,
  surFondSombre = true,
  className,
}: {
  /** Côté du cartouche en pixels. */
  taille?: number;
  /** Pose l'emblème sur un cartouche blanc — indispensable sur le navy. */
  surFondSombre?: boolean;
  className?: string;
}) {
  const image = (
    <img
      src="/ageroute-logo.png"
      alt="AGEROUTE Guinée"
      width={taille}
      height={taille}
      className="h-full w-full object-contain"
    />
  );

  if (!surFondSombre) {
    return <div className={clsx("shrink-0", className)} style={{ width: taille, height: taille }}>{image}</div>;
  }

  return (
    <div
      className={clsx("shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-black/5", className)}
      style={{ width: taille, height: taille, padding: Math.max(3, Math.round(taille * 0.08)) }}
    >
      {image}
    </div>
  );
}
