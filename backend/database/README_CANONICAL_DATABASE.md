# KTC Canonical Database

`KTC_FULL_DATABASE_CANONICAL_20260817.sql` is the single database source of truth.

Deployment rule:
1. Restore the full SQL snapshot into TiDB.
2. Do not run incremental migrations.
3. Run `npm run db:verify` to verify the physical database contract.
4. Start the backend.

Master machine contract:
- GC: 33
- MAI: 35
- DO: 23 (1..22 + QC)
- CAN: 3 (16", 14", 10")
- EP: 29 (Press No 1..22 + INJ No 1,2,3,4,6,8,7)
- Total: 123

The backend validates physical tables/columns at startup and never uses a migration ledger.
