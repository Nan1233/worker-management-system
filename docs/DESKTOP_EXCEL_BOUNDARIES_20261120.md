# Desktop Excel boundaries — 2026-11-20

## Current refactor scope

The three remaining large legacy workbook implementations have been decomposed without changing their existing public entry points:

| Existing entry module | Responsibility retained | Extracted modules |
| --- | --- | --- |
| `companyExcelLocal.cjs` | Assemble legacy company and per-process workbooks | `companyExcelLayouts.cjs`, `companyExcelPeriod.cjs`, `companyExcelTemplateAdapter.cjs` |
| `originalProcessExcelTemplate.cjs` | Render original process-specific Excel sheets | `originalProcessTemplateRegistry.cjs`, `originalProcessTemplateHelpers.cjs` |
| `workerReportTemplateLocal.v2.cjs` | Render approved worker-report workbook and preserve its public interface | `workerReportTemplateRegistry.cjs`, `workerReportTemplateLoader.cjs`, `workerReportDetailMapping.cjs` |

## Design intent

- **Registry** modules own fixed process codes, template names, and workbook layout/column contracts. They do not call the database.
- **Template adapter** handles discovery of original date blocks, OOXML relationship normalization, VML note compatibility, and materialization of shared formulas.
- **Period module** handles month-year text, ExcelJS cached formula results, calendar dates, and `_KTC_META` (veryHidden).
- **Original template helpers** retain conditional formats, border rules and fail-closed defect-column projection.
- **Worker detail mapping** retains ID/code-first defect/deduction mapping, including distinct encoded GC `CAT01–CAT10` and `LONG01–LONG08` categories and explicit handling of legacy categories.
- **Worker template loader** retains resource lookup order and template-buffer caching across Electron installations.

## Compatibility contracts

Keep existing output names and workbook templates. In particular:
- `companyExcelLocal.cjs` continues to export `buildCompanyExcelLocal`, `buildProcessExcelLocal`, and the existing `_private` helpers.
- `originalProcessExcelTemplate.cjs` continues to export `FORMS`, `WORKBOOK1_FORMS`, `TEMPLATE_ROOT`, `templatePath`, and `renderOriginalProcessTemplate`.
- `workerReportTemplateLocal.v2.cjs` continues to export `TEMPLATE_NAME`, `PROCESS_CODES`, `PROCESS_FILE_PREFIXES`, and `buildWorkerProcessWorkbook`.
- Keep exact defect/deduction column mappings and the physical machine-vs-worker output rules. Do not silently merge distinct CAT/LONG defect categories.
- Electron's packaged `backend/templates` fallback remains mandatory. This is a Node/Electron Excel feature, not a filesystem feature of the Cloudflare Workers web backend.

## Review and release status

This work was committed only on `refactor/ktc-local-cleanup`. Static source inspection confirmed the three entry modules still declare their previous public exports and require the newly extracted modules. It has **not** yet established behavior equivalence, successful `node --check`, workbook fidelity, Electron packaging, or data round-trip.

Before merge, run Excel smoke/round-trip checks covering ordinary product lines, GC shared machines, CVK non-product work, persisted standards, locale/date handling, and both original-company and Workbook1 templates. No production deploy or TiDB production modifications occurred.
