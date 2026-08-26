# Runbook — Rotation des secrets JWT

Cette procédure est exécutée par l’équipe AGEROUTE en fenêtre de maintenance. Elle invalide volontairement toutes les sessions. Ne jamais placer les valeurs générées dans Git, un ticket ou un journal.

## Préparation

1. Annoncer la déconnexion générale et suspendre l’accès au frontend.
2. Vérifier qu’un `pg_dump -Fc` récent et restaurable existe.
3. Générer deux valeurs différentes sur l’hôte d’exploitation :

   ```sh
   openssl rand -base64 48
   openssl rand -base64 48
   ```

4. Conserver temporairement les valeurs dans le gestionnaire de secrets approuvé.

## Rotation

1. Révoquer tous les refresh tokens avec la configuration courante :

   ```sh
   docker compose exec -T erp-backend npm run security:revoke-tokens
   ```

   Conserver uniquement le compteur et l’horodatage affichés comme preuve.

2. Mettre à jour simultanément `JWT_SECRET` et `JWT_REFRESH_SECRET` dans le fichier `.env` non versionné.
3. Recréer le backend, puis le frontend. Ne pas exécuter `prisma db push`.
4. Vérifier `/api/health`, puis une nouvelle connexion avec un compte de recette.
5. Vérifier qu’un ancien access token et un ancien refresh token renvoient `401`.
6. Rétablir l’accès au frontend.

## Retour arrière

Un retour à une ancienne clé peut réactiver d’anciens access tokens non expirés. En cas de rollback applicatif, conserver les nouveaux secrets et relancer la révocation globale. Ne restaurer une ancienne clé que sur décision sécurité formelle, après analyse d’incident.

## Critères de sortie

- Deux secrets différents et aléatoires sont déployés.
- Tous les refresh tokens antérieurs sont marqués révoqués.
- Les anciennes sessions sont refusées.
- Une nouvelle connexion et un renouvellement fonctionnent.
- La preuve de changement ne contient aucun secret.
