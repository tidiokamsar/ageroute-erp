-- Périmètre initial du compte UGP existant
--
-- `UGP` devient un rôle à périmètre le 20/08/2026. La règle du système est
-- « rôle à périmètre SANS affectation = ne voit RIEN ». Sans cette opération,
-- le compte ugp@ageroute.gov.gn perdrait l'accès à tous les marchés à l'instant
-- du déploiement, sans message d'erreur : la page Marchés se viderait.
--
-- On lui affecte donc TOUS les projets, ce qui reproduit exactement sa
-- visibilité actuelle — et, l'affectation étant au niveau projet, elle couvrira
-- aussi les marchés créés plus tard. L'administrateur pourra ensuite la
-- restreindre projet par projet depuis l'écran Utilisateurs.
--
-- À exécuter AVANT le déploiement du code qui ajoute UGP à ROLES_SCOPES.
--
-- Idempotent : ON CONFLICT DO NOTHING sur la clé (userId, projetId).
-- Ne concerne QUE les comptes portant le rôle UGP au moment de l'exécution.

INSERT INTO projet_affectations (id, "userId", "projetId")
SELECT gen_random_uuid()::text, u.id, p.id
FROM users u
CROSS JOIN projets p
WHERE u.role = 'UGP'
  AND u.actif = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("userId", "projetId") DO NOTHING;
