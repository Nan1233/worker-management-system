'use strict';

// Excel export path:
// 1) lean builder for normal processes
// 2) direct one-sheet template builder for GC
// 3) precise ExcelJS stage diagnostics
// No generated-workbook -> template workbook copy/JSZip roundtrip.
require('./fastSingleSheetExport.cjs');
require('./fastGcTemplateExport.cjs');
require('./excelExportContractPatch.v3.cjs');
