# Runbook — Récupération du volume des pièces jointes (`erp_uploads`)

## Symptôme

Le conteneur `erp-backend` **refuse de démarrer** avec un message explicite :

```
Erreur: le répertoire des pièces jointes (UPLOAD_DIR=/app/uploads) n'est pas
inscriptible — EACCES.
Réparation : docker run --rm -v <nom_du_volume>:/v alpine chown -R 1000:1000 /v
```

Ou, sur un déploiement antérieur au contrôle au démarrage : tout
`POST /api/uploads` échoue en `EACCES` alors que `/api/health` reste au vert
(la panne n'apparaît qu'au premier téléversement d'un utilisateur).

## Cause

Le backend tourne sous `USER node` (uid/gid 1000). Le volume nommé
`erp_uploads`, créé le 18/08/2026 et peuplé sous `root:root`, n'est pas
affecté par le `chown` du Dockerfile (il ne s'applique qu'à l'image, jamais à
un volume déjà existant). Après l'adoption du `USER node`, le processus n'a
plus le droit d'écrire dedans.

## Réparation (à faire une seule fois par volume)

```bash
# 1. Identifier le volume (compose project prefix par défaut : répertoire)
docker volume ls | grep erp_uploads

# 2. Rendre le volume propriétaire de l'utilisateur node (uid 1000)
docker run --rm -v erp-ageroute_erp_uploads:/v alpine chown -R 1000:1000 /v

# 3. Redémarrer le backend et vérifier
docker compose up -d erp-backend
docker logs erp-backend --tail 20   # doit passer le contrôle d'inscriptibilité
```

## Vérification

1. Le conteneur démarre (le contrôle `verifierStockageInscriptible` passe) ;
2. Téléverser une pièce depuis l'application (portail entreprise ou écran
   décompte) → 201, fichier visible dans le volume :
   `docker run --rm -v erp-ageroute_erp_uploads:/v alpine ls -la /v/files | head`.

## Prévention

Le contrôle d'inscriptibilité au démarrage (`backend/src/lib/verifier-stockage.ts`)
fait échouer le conteneur **immédiatement** avec le geste de réparation dans le
message — une panne silencieuse au premier téléversement n'est plus possible.
Toute recréation du volume (migration d'hôte, restauration) doit être suivie
du `chown` ci-dessus.
