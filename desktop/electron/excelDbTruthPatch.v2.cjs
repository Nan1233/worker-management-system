'use strict';

// Excel export path:
// 1) lean builder for normal processes
// 2) direct one-sheet template builder for GC
// No generated-workbook -> template workbook copy/JSZip roundtrip.
require('./fastSingleSheetExport.cjs');
require('./fastGcTemplateExport.cjs');
