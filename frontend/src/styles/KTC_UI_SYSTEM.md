# KTC UI System v4

Presentation-only redesign layer for the Web frontend.

## Contract
- React/TypeScript/Vite application and business logic remain unchanged.
- Approve/Reject, API routes, authentication, database, offline sync and Excel flows are untouched.
- UI tokens/components follow shadcn-style principles: small composable primitives, semantic states, consistent spacing, focus rings and responsive behavior.
- The source archive is intentionally dependency-free for offline handoff; Tailwind/shadcn can be installed in the normal development environment without changing the UI contract.

## Visual priorities
1. Stable typography and no overflow on Login.
2. Consistent AppShell for Manager/Admin.
3. Worker-first touch targets and forms.
4. Dense but readable enterprise tables.
5. Responsive 360px / 768px / 1024px / 1440px layouts.
6. Light/dark contrast and reduced motion.
