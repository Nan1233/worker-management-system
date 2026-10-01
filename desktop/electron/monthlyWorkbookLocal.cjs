const ExcelJS = require('exceljs');
const { calculateProductionMetrics, DEFAULT_SETTINGS, trainingFactor, calculateNg } = require('./productionCalculationEngine.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require('../../shared/excelSyncContract.cjs');

// NOTE: Full source remains unchanged except for exporting formulaSettingsFor
// through _private so the fast single-sheet desktop exporter can reuse the
// exact same calculation settings without loading the large Excel template.

