# KTC production runtime gate

This is a **read-only** production verification. It does not migrate or mutate the database, deploy anything, or invoke GitHub Actions.

## API + DB readiness

Windows CMD:

```bat
set KTC_PRODUCTION_API_URL=https://worker-management-system-2-5jqv.onrender.com/api
npm run audit:production:runtime
```

Optional web check:

```bat
set KTC_PRODUCTION_API_URL=https://worker-management-system-2-5jqv.onrender.com/api
set KTC_PRODUCTION_WEB_URL=https://YOUR-FRONTEND-URL
npm run audit:production:runtime
```

The gate requires:

- `/api/health/ready` returns HTTP 200
- `status=ready`
- `schemaReady=true`
- `schemaContractVersion=26`
- `/api/health` returns ready
- optional frontend URL returns HTML

If schema verification fails, **do not bypass the gate**. Fix the TiDB schema/release state first.
