'use strict';

// Active test Excel export contract.
// v3 owns the GC one-sheet template injection and leaves other processes on
// the normal monthly workbook implementation. Do not load the older wrappers
// here because they override the active Module._load patch and reintroduce the
// slow generated-workbook path.
require('./excelExportContractPatch.v3.cjs');
