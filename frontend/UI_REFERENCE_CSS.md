# KTC CSS Design System

The KTC frontend uses a locally maintained CSS design system. It does not depend on an external website or third-party UI template for its application shell.

## Rules
- UI is implemented with the existing KTC React markup and `src/reference-ui.css`.
- No external template shell components are required.
- Existing routes, APIs, permissions, validation and business logic are preserved.
- `reference-ui.css` provides shared visual tokens and responsive presentation rules.
- Keep visual styles, spacing, typography and component states consistent across worker mobile screens and manager/admin desktop screens.

## Visual direction
- KTC blue enterprise palette with accessible contrast.
- Light workspace background.
- Compact left navigation on desktop.
- White cards with subtle borders and restrained shadows.
- Clear active navigation and action states.
- Readable KPI cards, filters, tables and action buttons.
- Responsive bottom navigation for mobile where appropriate.

## Design ownership
- Treat this repository's KTC design tokens and CSS as the source of truth.
- New UI work may use tools such as Google Stitch for exploration, but generated output must be adapted to KTC's existing React components, responsive rules, routes and business logic.
