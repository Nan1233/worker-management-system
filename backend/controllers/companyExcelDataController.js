const { loadBulkCompanyReports, PROCESS_CODES } = require('../services/bulkCompanyExcelDataService');
const { getSettingsMap } = require('../services/formulaSettingsService');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

const inFlightByScope = new Map();
const cacheByScope = new Map();
const CACHE_TTL_MS = Math.max(0, Math.min(10_000, Number(process.env.COMPANY_DATA_CACHE_TTL_MS || 5_000)));
const MAX_CACHE_ENTRIES = 8;

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function scopeCacheKey(yearMonth, actor, scope) {
  if (!actor || scope.type === 'ALL') return `${yearMonth}:ALL`;
  const ids = [...scope.processIds].sort((a, b) => a - b).join(',');
  return `${yearMonth}:LIMITED:${Number(actor?.id) || 'unknown'}:${ids}`;
}

async function buildCompanyData(yearMonth, actor) {
  const { processData, processIds, scope } = await loadBulkCompanyReports(yearMonth, actor);

  const diagnostics = Object.fromEntries(PROCESS_CODES.map((code) => {
    const data = processData[code] || {};
    return [code, {
      reports: Array.isArray(data.reports) ? data.reports.length : 0,
      deductionTypes: Array.isArray(data.deductionTypes) ? data.deductionTypes.length : 0,
      defectTypes: Array.isArray(data.defectTypes) ? data.defectTypes.length : 0,
      physicalMachineEvents: Array.isArray(data.physicalMachineEvents) ? data.physicalMachineEvents.length : 0
    }];
  }));

  const reportDates = [...new Set(
    PROCESS_CODES.flatMap((code) => (processData[code]?.reports || [])
      .map((report) => String(report.work_date || '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  )].sort();

  const mapsByDate = new Map();
  // Load formula settings once per date. The bulk report query above is the
  // important subrequest reduction; sequential loading also prevents a burst
  // of duplicate cache misses inside one Cloudflare Worker invocation.
  for (const date of reportDates) {
    mapsByDate.set(date, await getSettingsMap(date));
  }

  for (const code of PROCESS_CODES) {
    const data = processData[code];
    data.formulaSettingsByDate = Object.fromEntries(
      reportDates.map((date) => {
        const map = mapsByDate.get(date) || {};
        return [date, map[code] || map.GLOBAL || null];
      }).filter(([, settings]) => Boolean(settings))
    );

    data.reports = (data.reports || []).map((report) => {
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

  if (process.env.KTC_DEBUG_EXPORTS === 'true') console.log('[KTC] Company Excel data loaded', {
    yearMonth,
    scope: scope.type,
    processIds,
    diagnostics,
    formulaSettingDates: reportDates.length
  });

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
      'production_report_machine_lines',
      'machine_production_events',
      'machine_production_event_defects'
    ],
    processes: processData,
    formulaSettings,
    diagnostics,
    exportScope: scope.type
  };
}

async function getCompanyData(yearMonth, actor) {
  const scope = actor
    ? await require('../services/processAuthorizationService').getActorProcessScope(actor)
    : { type: 'ALL', processIds: null };
  const key = scopeCacheKey(yearMonth, actor, scope);

  const cached = cacheByScope.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.data;

  const running = inFlightByScope.get(key);
  if (running) return running;

  const task = buildCompanyData(yearMonth, actor)
    .then((data) => {
      if (CACHE_TTL_MS > 0) {
        cacheByScope.set(key, { createdAt: Date.now(), data });
        while (cacheByScope.size > MAX_CACHE_ENTRIES) {
          const oldestKey = cacheByScope.keys().next().value;
          if (oldestKey === undefined) break;
          cacheByScope.delete(oldestKey);
        }
      }
      return data;
    })
    .finally(() => inFlightByScope.delete(key));

  inFlightByScope.set(key, task);
  return task;
}

exports.get = async (req, res) => {
  const selectedDate = String(req.query?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return res.status(400).json({ success: false, message: 'Ngày xuất Excel không hợp lệ' });
  }

  try {
    const data = await getCompanyData(selectedDate.slice(0, 7), req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[KTC] COMPANY_DATA_FAILED', {
      requestId: req.requestId || req.id || null,
      selectedDate,
      role: normalizeRole(req.user),
      code: error.code || null,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
    return res.status(error.statusCode || error.status || 500).json({
      success: false,
      code: error.code || 'COMPANY_DATA_FAILED',
      message: error.message || 'Không thể tải dữ liệu Excel tháng'
    });
  }
};

exports._buildCompanyData = buildCompanyData;
exports._clearCompanyDataCache = () => {
  cacheByScope.clear();
  inFlightByScope.clear();
};
