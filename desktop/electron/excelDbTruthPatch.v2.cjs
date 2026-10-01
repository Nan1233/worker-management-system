'use strict';

// The lean single-sheet builder is now the source of truth for desktop Excel.
// Do not rebuild/copy the finished workbook through a second ExcelJS workbook.
// That roundtrip was the main source of the long pause after
// MONTHLY_SPLIT_WORKBOOKS_START for large GC months.
require('./fastSingleSheetExport.cjs');
