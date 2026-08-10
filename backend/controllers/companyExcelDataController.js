const { assertReportVolume } = require('../services/excelExportGuards');
const { loadProcessMonthReports } = require('../services/processExcelExportService');
const db = require('../config/db');
const { getSettingsMap } = require('../services/formulaSettingsService');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

const PROCESS_CODES = ['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3'];
const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);
const inFlightByMonth = new Map();
const cacheByMonth = new Map();
const CACHE_TTL_MS = Math.max(0, Math.min(10_000, Number(process.env.COMPANY_DATA_CACHE_TTL_MS || 5_000)));
const MAX_CACHE_ENTRIES = 1;

async function buildCompanyData(yearMonth) {
  const placeholders = PROCESS_CODES.map(() => '?').join(',');
  const processes = await query(
    `SELECT id, process_code, process_name
     FROM processes
     WHERE UPPER(process_code) IN (${placeholders})
     ORDER BY id`,
    PROCESS_CODES
  );

  await assertReportVolume({
    yearMonth,
    processIds: processes.map((row) => Number(row.id))
  });

  const processData = Object.fromEntries(PROCESS_CODES.map((code) => [code, {
    processId: null,
    processCode: code,
    processName: code,
    reports: [],
    deductionTypes: [],
    defectTypes: []
  }]));
  for (const process of processes) {
    const code = String(process.process_code || '').toUpperCase();
    const reports = await loadProcessMonthReports(yearMonth, Number(process.id));
    processData[code] = {
      processId: Number(process.id),
      processCode: code,
      processName: process.process_name,
      reports,
      deductionTypes: reports.deductionTypes || [],
      defectTypes: reports.defectTypes || []
    };
  }

  const diagnostics = Object.fromEntries(PROCESS_CODES.map((code) => {
    const data = processData[code] || {};
    return [code, {
      reports: Array.isArray(data.reports) ? data.reports.length : 0,
      deductionTypes: Array.isArray(data.deductionTypes) ? data.deductionTypes.length : 0,
      defectTypes: Array.isArray(data.defectTypes) ? data.defectTypes.length : 0
    }];
  }));

  // Công thức có thể đổi giữa tháng. Trả thêm cấu hình theo từng ngày có dữ liệu
  // để Desktop tính đúng từng báo cáo, đồng thời giữ formulaSettings mức tháng cho
  // tương thích với các bản Desktop cũ.
  const reportDates = [...new Set(
    PROCESS_CODES.flatMap((code) => (processData[code]?.reports || [])
      .map((report) => String(report.work_date || '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  )].sort();
  const mapsByDate = new Map();
  await Promise.all(reportDates.map(async (date) => {
    mapsByDate.set(date, await getSettingsMap(date));
  }));
  for (const code of PROCESS_CODES) {
    processData[code].formulaSettingsByDate = Object.fromEntries(
      reportDates.map((date) => {
        const map = mapsByDate.get(date) || {};
        return [date, map[code] || map.GLOBAL || null];
      }).filter(([, settings]) => Boolean(settings))
    );

    // Backend là nguồn tính chuẩn. Desktop/Excel ưu tiên snapshot này thay vì
    // tự diễn giải lại công thức, tránh lệch số giữa API, màn hình và file Excel.
    processData[code].reports = (processData[code].reports || []).map((report) => {
      const workDate = String(report.work_date || '').slice(0, 10);
      const map = mapsByDate.get(workDate) || {};
      const settings = map[code] || map.GLOBAL || undefined;
      return {
        ...report,
        calculationSnapshot: calculateProductionMetrics(report, settings)
      };
    });
  }

  const formulaSettings = await getSettingsMap(`${yearMonth}-01`);

  console.log('[KTC] Company Excel data loaded', { yearMonth, diagnostics, formulaSettingDates: reportDates.length });

  return {
    yearMonth,
    mode: 'SPLIT_MONTHLY_WORKBOOKS',
    expectedFileCount: PROCESS_CODES.length + 1,
    calculationContractVersion: 2,
    dataSource: 'tidb.production_reports.approved',
    sourceTables: [
      'production_reports',
      'production_report_deductions',
      'production_report_defects',
      'production_report_machine_lines'
    ],
    processes: processData,
    formulaSettings,
    diagnostics
  };
}

async function getCompanyData(yearMonth) {
  const cached = cacheByMonth.get(yearMonth);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.data;

  const running = inFlightByMonth.get(yearMonth);
  if (running) return running;

  const task = buildCompanyData(yearMonth)
    .then((data) => {
      if (CACHE_TTL_MS > 0) {
        cacheByMonth.clear();
        cacheByMonth.set(yearMonth, { createdAt: Date.now(), data });
        while (cacheByMonth.size > MAX_CACHE_ENTRIES) {
          cacheByMonth.delete(cacheByMonth.keys().next().value);
        }
      }
      return data;
    })
    .finally(() => inFlightByMonth.delete(yearMonth));

  inFlightByMonth.set(yearMonth, task);
  return task;
}

exports.get = async (req, res) => {
  const selectedDate = String(req.query?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return res.status(400).json({ success: false, message: 'Ngày xuất Excel không hợp lệ' });
  }

  try {
    const data = await getCompanyData(selectedDate.slice(0, 7));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[KTC] COMPANY_DATA_FAILED', {
      requestId: req.requestId || req.id || null,
      selectedDate,
      code: error.code || null,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'COMPANY_DATA_FAILED',
      message: error.message || 'Không thể tải dữ liệu Excel tháng'
    });
  }
};

exports._clearCompanyDataCache = () => {
  cacheByMonth.clear();
  inFlightByMonth.clear();
};
