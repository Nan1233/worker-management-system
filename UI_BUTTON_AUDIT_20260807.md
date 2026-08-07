# KTC UI button audit — 2026-08-07

## Fixed from the approved-report screenshot
- `management-all-dates-button` had JSX class but no CSS rule. It was rendered as a browser-default black-outline button.
- `management-export-button` had JSX class but no CSS rule. It was also rendered with browser-default styling.
- `Xóa lọc` lived as a standalone grid item, so it became a wide, visually disconnected control on the second filter row.
- Moved `Xóa lọc` into the shared action bar and made it a tertiary action.
- `Xem chi tiết` is now the standard secondary action.
- Excel update/download is now the standard KTC primary action.
- Scope toggle is now a proper secondary/toggle control with an active brand state.
- Disabled controls use one explicit muted state instead of opacity/browser defaults.

## Whole-frontend audit
- Scanned button class names in Worker, Manager/Admin and shared components.
- No button class referenced by literal `className="..."` is missing a CSS definition after this pass.
- Normalized recurring management/admin action geometry: 42px control height, 10px radius, 13px/700 label, shared hover/focus/disabled states.
- Preserved semantic colors: primary brand blue, approve green, reject red, neutral secondary white, tertiary clear transparent.
- Normalized Master Data, Formula Settings, Governance, System Center, report modals, selected-review actions and report pagination/action bars.
- Kept navigation/tab/card buttons intentionally distinct where their role differs from ordinary form actions.

## Responsive rules
- Desktop: clear action is separated to the left; workflow actions align right.
- <=820px: actions become a 2-column grid and clear gets its own full row.
- <=520px: actions become one column.
- Approved month filter collapses correctly on phone widths.

## Static verification
- CSS brace balance: OK.
- Referenced button-class CSS audit: 0 missing literal classes.
- Full TypeScript build cannot run in the artifact sandbox because frontend `node_modules` is intentionally absent; run `npm run verify` on the Windows repo before commit/build.
