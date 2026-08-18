/**
 * Composants d'accès aux fichiers protégés (pièces jointes).
 * - SecureFileLink : lien qui obtient une URL signée avant ouverture ;
 * - SecureImg      : image dont la source est signée au chargement.
 * href absent → rendu non cliquable ; URL externe → comportement <a> normal.
 */
import { useEffect, useState, type ReactNode } from "react";
import { isProtectedFile, signFileUrl } from "../../lib/secureFile";

interface SecureFileLinkProps {
  href?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function SecureFileLink({ href, children, className = "", title }: SecureFileLinkProps) {
  if (!href) {
    return <span className={`${className} cursor-default opacity-70`}>{children}</span>;
  }
  if (!isProtectedFile(href)) {
    return <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>{children}</a>;
  }
  return (
    <a
      href={href}
      title={title ?? "Ouvrir le document"}
      className={`${className} cursor-pointer`}
      onClick={(e) => {
        e.preventDefault();
        signFileUrl(href)
          .then((signed) => window.open(signed, "_blank"))
          .catch(() => { /* l'intercepteur api gère l'authentification */ });
      }}
    >
      {children}
    </a>
  );
}

interface SecureImgProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function SecureImg({ src, alt, className = "" }: SecureImgProps) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSigned(null);
    if (!src) return;
    if (!isProtectedFile(src)) {
      setSigned(src);
      return;
    }
    signFileUrl(src)
      .then((url) => { if (alive) setSigned(url); })
      .catch(() => { /* laisse l'emplacement vide */ });
    return () => { alive = false; };
  }, [src]);

  if (!signed) return <div className={className} aria-label={alt} />;
  return (
    <img
      src={signed}
      alt={alt}
      className={className}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}
