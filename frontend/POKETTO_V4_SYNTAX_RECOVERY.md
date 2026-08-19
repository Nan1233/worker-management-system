# Poketto V4 syntax recovery

V4's automated page-root wrapper introduced TS1128 syntax errors in 8 complex pages.
Those 8 pages have been restored verbatim from the V3 baseline. The real Poketto
shell/template infrastructure from V4 remains intact.

Affected pages restored:
- admin/Governance
- lead/EditReport
- lead/Statistics
- manager/EditReport
- manager/ReportDetail
- manager/ReportDownload
- manager/SelectedReportsReview
- worker/Production

No business logic or API behavior was intentionally changed.
Future page migrations must be manual/component-level, not regex JSX wrapping.
