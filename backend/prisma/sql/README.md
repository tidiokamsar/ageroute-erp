# Évolution du schéma — règles

Le schéma PostgreSQL évolue **uniquement** par les fichiers de ce dossier, appliqués par `psql`
avec `-v ON_ERROR_STOP=1`. **Jamais `prisma db push`** : il détruirait les tables hors schéma
Prisma (`bpmn_*`, `ref_*`, `sig_*`) que le code lit par `$queryRaw`.

## Deux familles de fichiers

| Fichier | Rôle | Sur base vierge | Sur base existante |
|---|---|---|---|
| `0000-baseline-AAAA-MM-JJ.sql` | état complet du schéma à une date (`pg_dump --schema-only`) | **oui, en premier** | **jamais** |
| `AAAA-MM-JJ-objet.sql` | migration additive, **idempotente** | oui, dans l'ordre, après la baseline | oui — les rejouer est sans effet |

## Reconstruire une base vierge

```bash
psql -v ON_ERROR_STOP=1 -f 0000-baseline-2026-08-22.sql
for f in 2026-*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done   # idempotents
node dist/lib/seed.js                                            # comptes et circuits
```

Preuve faite le 22/08/2026 sur un conteneur PostgreSQL vierge (voir `DEPLOIEMENT.md §9`).

## Écrire une migration

- `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  `ADD VALUE IF NOT EXISTS`, `ON CONFLICT DO NOTHING` — le fichier doit pouvoir être rejoué.
- Colonnes en **camelCase quoté** (`"userId"`) : les modèles n'ont pas de `@map`.
- `ALTER TYPE … ADD VALUE` est **irréversible** et hors transaction.
- Si `schema.prisma` déclare une valeur ou une colonne, **la migration doit exister**. Le
  22/08/2026, `AuditAction.CONFIRM_BCRG` était déclaré sans migration : la seule voie vers
  `PAYE` échouait en production.
- Répéter sur copie restaurée avant production (`DEPLOIEMENT.md §4`).
- Régénérer la baseline après une série de migrations : `pg_dump --schema-only --no-owner
  --no-privileges`, daté, avec l'en-tête explicatif.
