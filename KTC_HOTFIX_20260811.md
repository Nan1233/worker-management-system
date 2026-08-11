# KTC hotfix 2026-08-11

Fixed POST /api/production-temp 500 caused by missing AuditService import.
Also prevented product-standard resolve calls while typing partial autocomplete values.

Changed files:
- backend/models/productionTempCreateModel.js
- frontend/src/pages/worker/ProcessPage.tsx
- frontend/src/pages/worker/components/ProcessBasicInfoSection.tsx
