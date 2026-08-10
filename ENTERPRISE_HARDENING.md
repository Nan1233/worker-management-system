# KTC Worker Management System — Enterprise hardening

## What changed

- Approved reports cannot be edited or deleted while their reporting period is locked.
- Moving an approved report into a locked reporting period is also blocked.
- Approved-report edits/deletes require an explicit audit reason.
- Duplicate worker/client request submissions are protected by a database UNIQUE index.
- Production startup validates required environment variables before opening the service.
- Google Sheet credentials are required only when Google sync is enabled.
- Process Excel export no longer mutates `process.env` while a request is running.
- Desktop enforces a single application instance to avoid concurrent writes to local Excel files.
- Legacy duplicate approved-report update/delete controller implementations were removed.
- A migration runner with checksums tracks schema changes.

## Database migration

Before deploying this hardening release to production, back up the database and run:

```cmd
cd /d C:\VSCode\worker-management-system
npm run db:migrate
npm run db:indexes
```

Migration `008_client_request_idempotency.sql` intentionally fails if existing duplicate
`(worker_id, client_request_id)` values exist. This is safer than silently deleting production data.
Resolve duplicates after review, then run the migration again.

## Verification

```cmd
npm run install:all
npm run verify
npm run build:exe
```

Do not use `npm audit fix --force` as part of the release process without reviewing breaking changes.
