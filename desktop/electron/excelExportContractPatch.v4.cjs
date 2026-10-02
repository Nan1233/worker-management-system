'use strict';
// Active GC export wrapper: keep the existing v3 export implementation,
// then apply the final template/date/color normalization pass from v5.
module.exports = require('./excelExportContractPatch.v3.cjs');
module.exports = require('./excelExportContractPatch.v5.cjs');
