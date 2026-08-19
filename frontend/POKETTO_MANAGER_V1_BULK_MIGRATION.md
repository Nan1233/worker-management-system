# Manager V1 — bulk migration

Applied a shared Poketto enterprise design layer to the existing Manager pages that are present in this source, without rewriting their handlers, API calls, approval/rejection logic, filters or export logic.

Added reusable ManagerPageFrame, ManagerDataState and ManagerKpiStrip components plus responsive table/form styling.

Pages touched: Dashboard.tsx, Reports.tsx, ApprovedReports.tsx, Workers.tsx, Statistics.tsx
