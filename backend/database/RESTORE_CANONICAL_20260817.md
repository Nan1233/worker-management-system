# KTC — Restore canonical database

The database is restored as a complete snapshot. There is no incremental migration step.

## TiDB / MySQL compatible

Use the canonical file:

`backend/database/KTC_FULL_DATABASE_CANONICAL_20260817.sql`

The file:
- drops/recreates `worker_management`;
- contains the physical schema used by backend 1.9.x;
- contains master data from the current KTC snapshot;
- contains the 123-machine contract;
- includes DO/QC and EP/INJ 1,2,3,4,6,8,7;
- includes master reconciliation source tables.

After restore:

```bash
npm run db:verify
npm start
```

Expected:

```text
DATABASE CONTRACT READY
Source: FULL_DATABASE_SNAPSHOT
[KTC] runtime READY
```

Do NOT run `npm run db:migrate`. The incremental migration command is no longer part of the backend release scripts.
