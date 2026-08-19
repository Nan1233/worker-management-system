# KTC Render / Source Consistency Fix — 2026-08-19

Applied from the current Git source ZIP:

- Render frontend now builds from `frontend/` with `npm ci && npm run build`.
- Render backend is declared in `render.yaml` with `backend/`, `npm ci`, `npm start`, and `/api/health/ready`.
- Root package metadata is `ktc-worker-management-system`.
- Added root `npm run verify`.
- Removed stale duplicate root web/mobile source trees required by the existing source-consistency contract.
- Removed unused `vercel.json` because production deployment is Render-only.
- Updated deployment documentation and source-consistency contract.

Secrets remain Render-managed and are not added to the repository.
