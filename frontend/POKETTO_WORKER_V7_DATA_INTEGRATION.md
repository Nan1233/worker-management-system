# Worker V7 — data integration bridge

The Poketto pages now include a shared data-state bridge for loading/error/empty states.

Existing KTC service/API modules remain the only source of truth for production, history, notifications and profile data. No new API endpoints or guessed response shapes were introduced.

Worker source pages found in this release:
- ProcessPage.tsx
- Production.tsx
- ProductionDetail.tsx
- ProductionHistory.tsx
- ProductionTemplate.tsx
- Profile.tsx
- SelectProcess.tsx
- WorkerHistoryTemplate.tsx
- WorkerNotificationTemplate.tsx
- WorkerProfileTemplate.tsx
- WorkerTemplateHome.tsx

Next migration step: wire each existing page's actual service calls into the corresponding Poketto components, preserving its current handlers and validation.
