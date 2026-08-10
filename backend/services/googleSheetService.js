const { calculateCountedNg } = require('../utils/outputCalculation');
const { trainingFactor } = require('../utils/trainingPercent');
const { google } = require('googleapis');
const ReportService = require('./reportService');
const db = require('../config/db');

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Cắt lồng';
const HEADER_ROW = 1;
const DATA_START_ROW = 2;

const getGoogleAuth = () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Thiếu biến môi trường GOOGLE_SERVICE_ACCOUNT');
  let credentials;
  try { credentials = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT không phải JSON hợp lệ'); }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
};


const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const loadActiveTypes = async (reports) => {
  const processIds = [...new Set(reports.map((report) => Number(report.process_id)).filter(Boolean))];
  if (!processIds.length) return { deductionTypes: [], defectTypes: [] };
  const placeholders = processIds.map(() => '?').join(',');
  const [deductionTypes, defectTypes] = await Promise.all([
    query(`SELECT id, process_id, deduction_code, deduction_name, sort_order
           FROM deduction_types
           WHERE process_id IN (${placeholders}) AND status = 'active'
           ORDER BY process_id, sort_order, id`, processIds),
    query(`SELECT id, process_id, defect_code, defect_name, sort_order
           FROM defect_types
           WHERE process_id IN (${placeholders}) AND status = 'active'
           ORDER BY process_id, sort_order, id`, processIds)
  ]);
  return { deductionTypes, defectTypes };
};

const toNumber = (value) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDate = (value) => {
  const key = normalizeDateKey(value);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};

const normalizeType = (item, kind) => ({
  id: Number(item.id ?? item[`${kind}_type_id`]),
  name: String(item[`${kind}_name`] || item[`${kind}_code`] || '').trim(),
  sort_order: Number(item.sort_order) || 0,
  process_id: Number(item.process_id) || 0
});

const collectTypes = (reports, kind) => {
  const map = new Map();
  const key = kind === 'deduction' ? 'deductions' : 'defects';
  for (const report of reports) {
    for (const raw of report[key] || []) {
      const item = normalizeType(raw, kind);
      if (item.id && !map.has(item.id)) map.set(item.id, item);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.process_id - b.process_id || a.sort_order - b.sort_order || a.id - b.id
  );
};

const detailValue = (items, typeId, valueKey, typeKey) => (items || [])
  .filter((item) => Number(item[typeKey]) === Number(typeId))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const compareReports = (a, b) => {
  const dateCompare = normalizeDateKey(a.work_date).localeCompare(normalizeDateKey(b.work_date));
  if (dateCompare) return dateCompare;
  const workerCompare = String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true });
  if (workerCompare) return workerCompare;
  return Number(a.id) - Number(b.id);
};

const columnLetter = (number) => {
  let result = '';
  let n = number;
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
};

const mergeTypes = (configuredTypes, reports, kind) => {
  const source = [
    ...(configuredTypes || []),
    ...collectTypes(reports, kind)
  ];
  const map = new Map();
  source.map((item) => normalizeType(item, kind)).forEach((item) => {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()].sort((a, b) =>
    a.process_id - b.process_id || a.sort_order - b.sort_order || a.id - b.id
  );
};

const sumDetailValues = (items, valueKey, allowedTypeIds = null, typeKey = null) => (items || [])
  .filter((item) => !allowedTypeIds || allowedTypeIds.has(Number(item[typeKey])))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const buildSheetValues = (reports, options = {}) => {
  const deductionTypes = mergeTypes(options.deductionTypes, reports, 'deduction');
  const defectTypes = mergeTypes(options.defectTypes, [], 'defect');
  const headers = [
    'STT', 'Mã nhân viên', 'Tên', 'Số máy', 'Ca', '% học việc',
    'Thời gian làm việc', 'Thời gian làm thực tế', 'Tổng trừ h',
    ...deductionTypes.map((item) => item.name),
    'Loại SP', 'Định mức', 'TT', 'Tỷ lệ đạt', 'Ngày/Tháng', 'Số SP/H',
    'OK', 'Tổng NG', 'Tỷ lệ NG',
    ...defectTypes.map((item) => item.name)
  ];

  let currentDate = '';
  let sequence = 0;
  const rows = reports.map((report) => {
    const dateKey = normalizeDateKey(report.work_date);
    if (dateKey !== currentDate) { currentDate = dateKey; sequence = 1; } else { sequence += 1; }
    const ok = toNumber(report.tt_ok);
    // Tổng NG lấy từ toàn bộ production_report_defects của báo cáo, không lấy cột tổng cũ.
    const activeDefectIds = new Set(defectTypes.map((item) => Number(item.id)));
    const ng = sumDetailValues(report.defects, 'quantity', activeDefectIds, 'defect_type_id');
    const tt = Number(report.actual_output ?? (ok + calculateCountedNg(report.defects, Boolean(Number(report.exclude_kqd_from_tt || 0)))));
    const standard = Math.round(toNumber(report.standard_output));
    const actualTime = toNumber(report.actual_time);
    return [
      sequence,
      report.worker_code || '',
      report.full_name || report.worker_name || '',
      report.machine_no || '',
      report.shift || '',
      trainingFactor(report.training_percent),
      toNumber(report.total_time),
      actualTime,
      toNumber(report.deduction_time),
      ...deductionTypes.map((type) => detailValue(report.deductions, type.id, 'hours', 'deduction_type_id')),
      report.product_name || '',
      standard,
      tt,
      standard > 0 ? tt / standard : 0,
      formatDate(report.work_date),
      actualTime > 0 ? tt / actualTime : 0,
      ok,
      ng,
      tt > 0 ? ng / tt : 0,
      ...defectTypes.map((type) => detailValue(report.defects, type.id, 'quantity', 'defect_type_id'))
    ];
  });
  return { headers, rows, deductionTypes, defectTypes };
};

const ensureSheet = async (sheets) => {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const found = metadata.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (found) return found.properties.sheetId;
  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
  });
  return response.data.replies?.[0]?.addSheet?.properties?.sheetId;
};

const writeSheetData = async (sheets, reports, options = {}) => {
  const sheetId = await ensureSheet(sheets);
  const { headers, rows } = buildSheetValues(reports, options);
  const endColumn = columnLetter(headers.length);

  // Xóa vùng bảng động, sau đó luôn ghi tiêu đề ở hàng 1 và dữ liệu từ hàng 2.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:${endColumn}`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${HEADER_ROW}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] }
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A${DATA_START_ROW}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'WRAP'
              }
            },
            fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length }
          }
        }
      ]
    }
  });

  return { columnCount: headers.length, rowCount: rows.length };
};

exports.syncProductionReport = async (date) => {
  if (!spreadsheetId) throw new Error('Thiếu biến môi trường GOOGLE_SPREADSHEET_ID');
  const reports = await ReportService.getAllApprovedReportsForSheet();
  reports.sort(compareReports);
  const activeTypes = await loadActiveTypes(reports);
  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const result = await writeSheetData(sheets, reports, activeTypes);
  console.log('GOOGLE SHEET DYNAMIC SYNC:', { date, reports: reports.length, ...result });
  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, ...result };
};

exports.createSheet = exports.syncProductionReport;
exports.updateSheet = exports.syncProductionReport;
exports.buildSheetValues = buildSheetValues;
