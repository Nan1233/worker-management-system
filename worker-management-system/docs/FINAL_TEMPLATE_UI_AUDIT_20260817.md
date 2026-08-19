# KTC Final Template / UI Audit — 2026-08-17

## Source of truth

The canonical production workbook in this source package is:

`backend/templates/file mẫu.xlsx`

It contains the production sheets:

- CÁN
- EP
- XLBV
- Cắt lồng
- TT Mài
- TT Đo
- TT Kiểm 1
- TT Kiểm 2
- sx3

## Export contract

Process exports now use the canonical workbook and preserve its sheet/layout/style. The exact detail blocks are:

| Code | Sheet | Header | Data start | Data end |
|---|---|---:|---:|---:|
| CAN | CÁN | 133 | 134 | 3323 |
| EP | EP | 173 | 174 | 3772 |
| XLBV | XLBV | 333 | 334 | 3391 |
| GC | Cắt lồng | 326 | 327 | 515 |
| MAI | TT Mài | 338 | 339 | 468 |
| DO | TT Đo | 207 | 208 | 4607 |
| K1 | TT Kiểm 1 | 208 | 209 | 329 |
| K2 | TT Kiểm 2 | 246 | 247 | 396 |
| SX3 | sx3 | 3 | 6 | 9 |

The export layer refuses to silently overflow a template block. It also removes broken `#REF!` and external-workbook formulas from the generated workbook to prevent broken-link/error popups while keeping the template's sheet/layout/style.

## Form contract

The worker schemas remain business-code driven, but export mapping is now template-driven. This separates business validation from Excel presentation and prevents hard-coded export layout from drifting away from the company workbook.

## Master-data import audit

The existing import flow is retained because it already has:

- preview before mutation;
- field/numeric validation;
- duplicate business-key detection;
- process-scope authorization;
- CREATE / UPDATE / REACTIVATE / DEACTIVATE / UNCHANGED;
- 10% deactivation safety threshold;
- transaction + rollback;
- sync batch + per-row audit log.

No automatic destructive import is enabled by default.

## UI

The new edge-to-edge shell removes the outer mobile worker/page frame and side gaps. Internal form controls/cards keep their own visual hierarchy, but the application shell itself fills the viewport. iOS safe-area handling remains.

## Validation performed on the uploaded source

- Canonical workbook exists and contains all 9 production process sheets.
- Every configured data block is inside the actual worksheet bounds.
- New JavaScript services pass `node --check`.
- No Git commit or GitHub modification was performed for this ZIP.
