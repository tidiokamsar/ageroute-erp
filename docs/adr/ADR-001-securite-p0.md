# ADR-001 — Socle de sécurité P0

- Statut : accepté
- Date : 2026-08-13
- Portée : secrets JWT, pièces jointes, en-têtes navigateur et autorisations API

## Contexte

L’ERP ordonnance des paiements publics. La revue a constaté des secrets JWT prévisibles, des pièces jointes sans contrôle d’accès, l’absence d’en-têtes sur le frontend et des contrôles module/ressource non appliqués.

## Options comparées

1. Conserver HMAC et renforcer validation, rotation, claims et révocation. Changement réduit, réversible et sans migration.
2. Ajouter une version de session en base. Invalidation très fine, mais migration SQL et coût sur toutes les émissions.
3. Migrer vers des clés asymétriques avec `kid`. Rotation progressive plus riche, mais exploitation et gestion de clés disproportionnées au pilote.

Pour les fichiers :

1. Authentifier seulement le GET : insuffisant contre les IDOR.
2. Retrouver le rattachement métier existant et appliquer module + entreprise + marché : retenu, sans migration.
3. Ajouter une table centrale `UploadAsset` : meilleure cible durable, mais migration et reprise des fichiers requises.

Pour les modules :

1. Garde centrale `requireAuth → checkModuleAccess → router` et gardes de ressource ciblées : retenu pour P0.
2. Gardes répétées dans chaque route : explicite, mais volume de changement supérieur.
3. Service d’autorisation action/ressource central : cible durable, hors correctif minimal.

## Décision

- Deux secrets HMAC aléatoires distincts d’au moins 48 caractères, HS256, issuer/audience séparés et `jti`.
- L’utilisateur actif et son rôle courant sont relus à chaque requête authentifiée.
- La rotation révoque tous les refresh tokens ; leur consommation est atomique.
- Les fichiers ont un nom opaque de 192 bits, sont accessibles uniquement avec JWT et uniquement s’ils sont rattachés à une ressource visible.
- Les agents MISSION/TECHNIQUE sans affectation ont un périmètre vide.
- Les en-têtes sont posés par nginx sur le frontend ; Helmet reste responsable de l’API.
- Aucun changement de schéma ni nouvelle dépendance.
- L’outillage frontend est maintenu sur des versions corrigées (Vite 8, Vitest 4, React Router 7) avec Node.js 20.19 minimum ; aucune dépendance fonctionnelle supplémentaire n’est introduite.

## Conséquences et limites

- La validation DB à chaque requête augmente la charge mais garantit la désactivation et le changement de rôle immédiats.
- Un fichier téléversé mais jamais rattaché reste inaccessible ; un nettoyage différé devra être conçu sans suppression physique non maîtrisée.
- `style-src 'unsafe-inline'` reste nécessaire aux styles React existants. `script-src` demeure strict.
- Les routeurs dormants ne sont pas remontés dans ce lot.
- Les transitions BPMN demandent une revue métier plus large ; P0 ferme les contournements directs identifiés sans refondre le moteur.

## Preuves attendues

- `npm test` backend.
- Builds backend/frontend.
- `nginx -t` puis vérification des en-têtes en environnement de recette.
- Tests d’intégration 401/403/404 avec une base de recette pour modules, entreprises, affectations et rattachements.
