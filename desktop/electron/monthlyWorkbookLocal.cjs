const ExcelJS = require('exceljs');
const { calculateProductionMetrics, DEFAULT_SETTINGS, trainingFactor, calculateNg } = require('./productionCalculationEngine.cjs');

const PROCESS_SHEETS = Object.freeze({
  CAN: { sheet: 'CÁN', title: 'CÁN', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  EP: { sheet: 'ÉP', title: 'ÉP', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  XLBV: { sheet: 'XỬ LÝ BAVIA', title: 'XỬ LÝ BAVIA', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  GC: { sheet: 'CẮT LỒNG', title: 'CẮT/LỒNG', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  MAI: { sheet: 'MÀI', title: 'MÀI', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  DO: { sheet: 'ĐO', title: 'ĐO', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  K1: { sheet: 'KIỂM 1', title: 'KIỂM 1', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  K2: { sheet: 'KIỂM 2', title: 'KIỂM 2', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  SX3: { sheet: 'SẢN XUẤT 3', title: 'SẢN XUẤT 3', deductionGroup: 'LỖI MÁY / THỜI GIAN TRỪ', defectGroup: 'NG PART' }
});


// Tên file cố định để thư mục tháng luôn sắp xếp đúng thứ tự công đoạn.
// Không dùng dấu tiếng Việt trong tên file để tránh lỗi đường dẫn ở Excel/Windows cũ.
const PROCESS_FILE_PREFIXES = Object.freeze({
  CAN: '01_CAN',
  EP: '02_EP',
  XLBV: '03_XU_LY_BAVIA',
  GC: '04_CAT_LONG',
  MAI: '05_MAI',
  DO: '06_DO',
  K1: '07_KIEM_1',
  K2: '08_KIEM_2',
  SX3: '09_SAN_XUAT_3'
});

function monthlyFileSuffix(date, payload) {
  const yearMonth = String(payload?.yearMonth || date || '').slice(0, 7);
  const [year, month] = yearMonth.split('-');
  if (!/^\d{4}$/.test(year || '') || !/^\d{2}$/.test(month || '')) {
    throw new Error(`Tháng xuất Excel không hợp lệ: ${yearMonth}`);
  }
  return `${month}-${year}`;
}

function processWorkbookFileName(processCode, date, payload) {
  const prefix = PROCESS_FILE_PREFIXES[processCode];
  if (!prefix) throw new Error(`Công đoạn không hỗ trợ xuất file riêng: ${processCode}`);
  return `${prefix}_${monthlyFileSuffix(date, payload)}.xlsx`;
}

function summaryWorkbookFileName(date, payload) {
  return `00_TONG_HOP_SAN_XUAT_${monthlyFileSuffix(date, payload)}.xlsx`;
}



// Danh mục cố định đọc từ desktop/assets/templates/file-mau.xlsx.
// Mỗi công đoạn có cấu trúc riêng; master DB và dữ liệu thực tế được ghép thêm
// để không mất loại mới, nhưng các cột mẫu không biến mất khi tháng hiện tại = 0.
const PROCESS_TEMPLATE_SCHEMAS = Object.freeze({
  GC: {
    deductions: ['Thiếu sản lượng','Bật máy, xét máy','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mất điện','Mất khí','Chờ hàng','Bảo dưỡng máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','Giặt cs/cân cs, tuốt-tái pp, GL','5S','Học việc, đào tạo','Đi muộn về sớm'],
    defects: ['KQD','Vỡ cao su','K xước cong gãy','Cao su xoay','Cắt không đứt','Bavia','CSH','PPCM','KT lớn','KT nhỏ','LCS','Cắt lẹm','Rách NVL','Chân ngắn dài','Sót via','Fure trục']
  },
  MAI: {
    deductions: ['Thiếu sản lượng','Bật máy, xét máy, đầu giờ','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mài đá','Bảo dưỡng máy','Ko có KHSX, Dừng máy ko HT','Chờ hàng, hết hàng','Khí yếu','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','5s, đổ bụi,xì bụi,lấy bụi','Học việc','Thổi bụi,lấy bụi','Đi đo kiểm soát','Đi muộn/về sớm','Tắt máy hút bụi','Mất điện'],
    defects: ['KQD ĐẢO','Xô cs','PPCM / Mất điện','Hàng rơi','K- coleet','Thiếu - lẫn cs / CSH','Lỗi cao su']
  },
  DO: {
    deductions: ['Thiếu sản lượng','Chỉnh máy','Mất điện','Ko có KHSX','Chờ chỉnh máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','5s/lấy bụi','Rải hàng, mài, cv khác','Lưu DL','KS DF, KS đầu giờ','Thổi bụi','Khác,đẩy hàng xuất','Đi muộn về sớm','Kiểm kho','Học việc, đào tạo'],
    defects: ['Lớn','Nhỏ','Fure cao su','Fure trục','Trục cong','Lệch điểm','Lỗi cao su','Đảo cs','Lỗi trục','Chưa mài','Mài 2 lần','Hở vai']
  },
  K1: {
    extras: [
      { key: 'press_date', header: 'Ngày tháng Ép', kind: 'date' },
      { key: 'press_box_shift', header: 'Ca / thùng Ép', kind: 'text' },
      { key: 'deduction_work', header: 'Công việc trừ giờ', kind: 'text' },
      { key: 'late_early_hours', header: 'Đi muộn, về sớm', kind: 'decimal' },
      { key: 'xlbv_deduction_worker', header: 'Trừ giờ XLBV (người làm)', kind: 'text' }
    ],
    deductions: ['Thiếu sản lượng'],
    defects: ['Dị vật do NVL','Tạp chất do NVL','DV dính via','DV do SX1','Bẩn do NVL','Bẩn (đen, trắng,vàng)','Bẩn khuôn','Bẩn chờ giặt','Biến dạng','Cách bậc','Thiếu NL','Bít lỗ','NG kích thước','Tắc vòi','NG KT','Lỗi khuôn','Hằn','Rách ĐPK','Rách','Rách lỗ rót','Xước sơn','Hở sắt','Rách do XLBV','Dính bavia','Bavia lòng trong','Chờ XLBV','Khác màu','Loang màu','Lẫn khuôn','Không khí - sống','Lỗi khác']
  },
  K2: {
    deductions: ['Thiếu sản lượng','Nghỉ giải lao','5S','Chuyển mã','Lau ố, lau gót chống','Lăn mốc','Hỗ trợ','Lau khay, lọc khay','Quét hàng, thổi bụi','Giao ca','Học kiểm, đào tạo','Check hàng','Xem MGH, mất điện','Lấy hàng và cất hàng','Đi muộn về sớm'],
    defects: ['Nứt vỡ, CSN, KĐĐ','Cắt lẹm, CP, 502','CS bẩn (hủy)','Bavia do cắt, không chân số','Lõm csu','Đảo, BD, HV','Mặt mài','Lẫn csu, thiếu cs','Không ĐT','Lồng- mài ngược','Coleet, K gót','K rãnh','K do gia lưu','K do gá','K va vào đá','Trục xước, bv trục','Dập trục','Bẩn Trục','Trục sét, lớp mạ','KNCC','BV đầu vào','Rỗ khí','Lỗ rách','Rách lòng trong','Rách cs non','Dị vật','Mài sót','MM Loang- sần, lõm','Mẻ cạnh, mẻ bánh răng','Nứt đường phân khuôn','Lẫn NVL','Bẩn NCC','Mốc cs','Chân bánh răng ngắn-dài, Cao su ngắn','Cao su dài','CHÂN BV SÂU, thiếu gate, chân gate cao','MM thô','NDPK','Hằn cs, nhăn','LBM','Rách ngang','CS BÓNG','NG-bàn đá','CS móp','Bavia bánh răng','KHOẢNG SÁNG','Lỗi rót','Khác','Tên lỗi khác(KĐTâm)','HCKT','Tái đi CVN','THIẾU LIỆU','CHỜ XLBV']
  },
  CAN: {
    extras: [
      { key: 'material_code', header: 'Mã nguyên liệu', kind: 'text' },
      { key: 'rolling_hours', header: 'Thời gian cán', kind: 'decimal' },
      { key: 'stop_reason', header: 'Lý do dừng máy', kind: 'text' }
    ],
    deductions: ['Vệ sinh máy cán','Sửa máy','Nghỉ giải lao','5S','Dừng sản xuất','CAN HC'],
    defects: ['Chân không','Rách vỡ','Bề mặt','Bavia']
  },
  EP: {
    extras: [
      { key: 'press_box_shift', header: 'Ca / thùng Ép', kind: 'text' },
      { key: 'handler', header: 'Người xử lý ép/bavia', kind: 'text' }
    ],
    deductions: ['Vệ sinh khuôn','Thay khuôn','5S + giao ca','Hâm khuôn','Sửa khuôn','Sửa máy','Nghỉ giải lao','Dừng máy','Thời gian trừ không đạt năng suất'],
    defects: ['Chân không','Rách vỡ','TNL','Dính via','Dị vật','Dính khuôn','Tạp chất']
  },
  XLBV: {
    extras: [
      { key: 'stop_operation_hours', header: 'Thời gian dừng thao tác', kind: 'decimal' },
      { key: 'deduction_work', header: 'Công việc', kind: 'text' },
      { key: 'shortage_hours', header: 'Thiếu SL', kind: 'decimal' }
    ],
    deductions: [],
    defects: ['CHÂN KHÔNG','RÁCH VỠ','XLBV','BẨN KHUÔN','TNL','DỊ VẬT','DẬP KO HẾT','BIẾN DẠNG','HỞ SẮT','Xước trục','CHỜ XL LẠI BV','KHÁC MÀU','BẨN']
  },
  SX3: {
    extras: [
      { key: 'work_minutes', header: 'Thời gian làm việc', kind: 'decimal' },
      { key: 'assembly_minutes', header: 'Thời gian lắp ráp thực tích', kind: 'decimal' },
      { key: 'tray_minutes', header: 'SỐ THAU', kind: 'decimal' },
      { key: 'plan_quantity', header: 'Kế hoạch', kind: 'integer' }
    ],
    deductions: ['Kẹt Bushing','Kẹt Tray Roller','Kẹt Slitring 1','Kẹt slitring 2','Kẹt washer','Thả bushing sai vị trí','Tay gắp gear sai','Kẹt Gear trên tay gắp','Tay gắp làm vỡ Gear','Rơi Gear','Tray Gear + Tray Roller lên quá hành trình','Bowl gỡ lò xo bị kẹt','Rơi đạn','Lỗi Xilanh 14 or 15','Lỗi Xilanh 16','Lỗi Xilanh 21','Lỗi Xilanh 42','Lỗi SS Washer','PUSH - NG Xilanh5','Lỗi vị trí Robot 3','Robot 6 Alam','Robot 8 Alam','Robot 9 Alam','Robot 10 Alam','Lỗi khác'],
    defects: ['Thiếu Slitring 1','Khe hở Slitring 1 lớn','Lắp 2 Slitring 1','Thiếu Washer','Thiếu Slitring & Washer','Lắp 2 Slitring & 2 Washer','Cao su lệch vị trí or đảo','Cao su bị rách, xước','Thiếu Slitring 2','Khe hở Slitring 2 lớn','Lắp 2 Slitring 2','Bushing xước, biến dạng, GÃY','Thiếu Bushing','Lắp 2 Bushing','Ngược Bushing','Thiếu Slitring 2 & Bushing','Slitring 2 không vào vấu','Lắp 2 lò xo','Thiếu Gear','Gear lắp quá tiêu chuẩn QAFC','Lực p/hủy Gear ngoài t/chuẩn','Gear dính bẩn','Lắp 2 Gear','Mẻ Gear','Thiếu Gear & Lò xo','Slitring mắc vào lò xo','Cong, Xước trục roller or Trục roller biến dạng','BẨN SLITRING','Bushing có vết bẩn','Kẹt bushing','RP']
  }
});

const COLORS = Object.freeze({
  navy: 'FF17365D',
  blue: 'FF2F75B5',
  blue2: 'FF5B9BD5',
  blueLight: 'FFDDEBF7',
  orange: 'FFED7D31',
  orangeLight: 'FFFCE4D6',
  green: 'FF70AD47',
  greenLight: 'FFE2F0D9',
  red: 'FFC00000',
  redLight: 'FFF4CCCC',
  gray: 'FF5B6573',
  grayLight: 'FFE7E6E6',
  white: 'FFFFFFFF',
  black: 'FF1F1F1F',
  border: 'FFB7C9E2',
  warning: 'FFFFF2CC'
});

const asText = (value) => String(value ?? '').trim();
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const asInteger = (value) => {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
};

const NUMBER_FORMATS = Object.freeze({
  // Ba phần dương;âm;0 giúp Excel 2016/WPS không hiển thị số 0 thành "0.".
  INTEGER: '#,##0;-#,##0;0',
  DECIMAL: '#,##0.##;-#,##0.##;0',
  RATE: '#,##0.######;-#,##0.######;0',
  PERCENT: '0.##%;-0.##%;0%',
  DATE: 'dd/mm/yyyy',
  DATETIME: 'dd/mm/yyyy hh:mm'
});

function isWholeNumber(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Math.abs(value - Math.round(value)) < 1e-9;
}

function resolvedNumberFormat(value, requestedFormat) {
  if (
    requestedFormat === NUMBER_FORMATS.DECIMAL
    || requestedFormat === NUMBER_FORMATS.RATE
  ) {
    return isWholeNumber(value) ? NUMBER_FORMATS.INTEGER : requestedFormat;
  }
  return requestedFormat;
}
const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const source = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return null;
  const [year, month, day] = source.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const asDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDateKey(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join('-');
}

const dateKey = localDateKey;

function assertApprovedDatabasePayload(payload) {
  if (!payload || payload.dataSource !== 'tidb.production_reports.approved') {
    throw new Error('Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  }
  for (const [code, data] of Object.entries(payload.processes || {})) {
    for (const report of data?.reports || []) {
      if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) {
        throw new Error(`Báo cáo ${report?.id || '?'} của ${code} không phải dữ liệu đã duyệt từ TiDB.`);
      }
    }
  }
}

function machineDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines
    .map((item) => asText(item.machine_code || item.machine_no || item.machine_name))
    .filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report.machine_no);
}

function productDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines.map((item) => asText(item.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report.product_name);
}

function countedNg(report) {
  return calculateNg(report).countedNg;
}

function reportTimeKey(report) {
  return asText(report.approved_at || report.created_at || report.entry_date || report.work_date);
}

function formulaSettingsFor(payload, processCode) {
  const source = payload?.formulaSettings || {};
  return source[String(processCode || '').toUpperCase()] || source.GLOBAL || DEFAULT_SETTINGS;
}

function excelOperationTypeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['CUT', 'CẮT', 'CAT'].includes(text)) return 'CẮT';
  if (['NEST', 'NESTING', 'LỒNG', 'LONG'].includes(text)) return 'LỒNG';
  return asText(value);
}

function excelOperationModeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE', 'MÁY', 'MAY'].includes(text)) return 'MÁY';
  if (['MANUAL', 'TAY', 'THỦ CÔNG', 'THU CONG'].includes(text)) return 'TAY';
  return asText(value);
}

function reportSnapshot(report, settings = {}) {
  const metrics = report.calculationSnapshot || calculateProductionMetrics(report, settings);
  return {
    id: asNumber(report.id),
    date: asDate(report.work_date),
    entryDate: asDateTime(report.created_at),
    workerCode: asText(report.worker_code),
    workerName: asText(report.full_name),
    shift: asText(report.shift),
    operationType: excelOperationTypeLabel(report.operation_type),
    operationMode: excelOperationModeLabel(report.operation_mode),
    machine: machineDisplay(report),
    product: productDisplay(report),
    training: metrics.trainingFactor,
    standard: metrics.standard,
    workingTime: metrics.workingTime,
    actualTime: metrics.actualTime,
    deductionTime: metrics.deductionTime,
    ok: metrics.ok,
    ng: metrics.allNg,
    countedNg: metrics.countedNg,
    enteredOutput: metrics.enteredOutput,
    output: metrics.adjustedOutput,
    outputPerHour: metrics.outputPerHour,
    achievement: metrics.achievement,
    ngRate: metrics.ngRate,
    status: asText(report.status),
    note: asText(report.note)
  };
}

function achievementColor(value, settings) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const percentValue = Number(value) * 100;
  if (percentValue < Number(settings.threshold_red ?? 80)) return 'FFFDE8E7';
  if (percentValue < Number(settings.threshold_orange ?? 95)) return 'FFFFEEDB';
  if (percentValue < Number(settings.threshold_yellow ?? 100)) return 'FFFFF7CC';
  if (percentValue < Number(settings.threshold_green ?? 110)) return 'FFE1F5E8';
  return 'FFDCEEFF';
}

function detailId(item, kind) {
  const value = kind === 'deduction'
    ? item?.deduction_type_id ?? item?.type_id ?? item?.id
    : item?.defect_type_id ?? item?.type_id ?? item?.id;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function detailCode(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
    : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code);
}

function detailLabel(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.deduction_type_code ?? item?.deduction_code ?? item?.code
    : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code);
}

function detailKey(item, kind) {
  const id = detailId(item, kind);
  if (id !== null) return `id:${id}`;
  const code = detailCode(item, kind);
  if (code) return `code:${normalize(code)}`;
  const name = detailLabel(item, kind);
  return name ? `name:${normalize(name)}` : '';
}

function detailAliases(item, kind) {
  const aliases = new Set();
  const id = detailId(item, kind);
  const code = detailCode(item, kind);
  const label = detailLabel(item, kind);
  if (id !== null) aliases.add(`id:${id}`);
  if (code) aliases.add(`code:${normalize(code)}`);
  if (label) aliases.add(`name:${normalize(label)}`);
  return [...aliases];
}

function labelQuality(label, kind) {
  const text = asText(label);
  if (!text) return 0;
  const normalized = normalize(text);
  let score = text.length;
  if (/^\d+$/.test(text)) score -= 30;
  if (/^(KHAC|OTHER|NG|TRU GIO)$/.test(normalized)) score -= 20;
  if (kind === 'deduction' && /TRU GIO/.test(normalized)) score += 2;
  if (kind === 'defect' && normalized.length > 2) score += 2;
  if (text.includes(' ')) score += 5;
  return score;
}

function processDetailTypes(processCode, processData, masterKey, reportKey, kind) {
  const result = [];
  const byAlias = new Map();
  const append = (item) => {
    const aliases = detailAliases(item, kind);
    if (!aliases.length) return;
    const candidateLabel = detailLabel(item, kind) || (kind === 'deduction' ? 'Trừ giờ khác' : 'NG khác');
    let current = aliases.map((alias) => byAlias.get(alias)).find(Boolean);
    if (!current) {
      current = { key: detailKey(item, kind), label: candidateLabel, aliases: new Set(aliases) };
      result.push(current);
    } else {
      aliases.forEach((alias) => current.aliases.add(alias));
      if (labelQuality(candidateLabel, kind) > labelQuality(current.label, kind)) current.label = candidateLabel;
    }
    current.aliases.forEach((alias) => byAlias.set(alias, current));
  };
  const templateLabels = PROCESS_TEMPLATE_SCHEMAS[processCode]?.[kind === 'deduction' ? 'deductions' : 'defects'] || [];
  for (const label of templateLabels) append({ code: normalize(label), name: label });
  for (const item of processData?.[masterKey] || []) append(item);
  for (const report of processData?.reports || []) {
    for (const item of report?.[reportKey] || []) append(item);
  }
  return result.map((item) => ({ key: item.key, label: item.label, aliases: [...item.aliases] }));
}

function detailValue(item, kind) {
  const value = asNumber(kind === 'deduction'
    ? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.hours ?? item?.value
    : item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value);
  return kind === 'defect' && value !== null ? Math.round(value) : value;
}

function detailMap(items, kind) {
  const map = new Map();
  for (const item of items || []) {
    const value = detailValue(item, kind) || 0;
    for (const alias of detailAliases(item, kind)) map.set(alias, (map.get(alias) || 0) + value);
  }
  return map;
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } }
  };
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyAllBorders(sheet, { fromRow = 1, toRow = null, fromCol = 1, toCol = null } = {}) {
  const lastRow = Math.max(fromRow, Number(toRow || sheet.rowCount || 0));
  const lastCol = Math.max(fromCol, Number(toCol || sheet.columnCount || 0));
  for (let row = fromRow; row <= lastRow; row += 1) {
    for (let col = fromCol; col <= lastCol; col += 1) {
      sheet.getCell(row, col).border = thinBorder();
    }
  }
}

function applyCellStyle(cell, options = {}) {
  // Ghi đè đầy đủ style để Excel luôn hiển thị nội dung ngay khi mở file.
  cell.font = {
    name: 'Arial',
    size: options.size ?? 8,
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    color: { argb: options.fontColor || COLORS.black }
  };
  cell.fill = solidFill(options.fill || COLORS.white);
  cell.border = options.border === false ? {} : thinBorder();
  cell.alignment = {
    horizontal: options.align || 'center',
    vertical: 'middle',
    wrapText: options.wrap === true,
    shrinkToFit: options.shrink === true,
    textRotation: 0,
    indent: options.indent || 0
  };
  cell.protection = { locked: true, hidden: false };
}

function addCover(workbook, yearMonth, diagnostics) {
  const [year, month] = yearMonth.split('-');
  const sheet = workbook.addWorksheet('BÌA', { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 12 }));
  sheet.mergeCells('B3:L5');
  sheet.getCell('B3').value = 'BÁO CÁO SẢN XUẤT THÁNG';
  applyCellStyle(sheet.getCell('B3'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 22, border: false });
  sheet.mergeCells('B6:L7');
  sheet.getCell('B6').value = `THÁNG ${month}/${year}`;
  applyCellStyle(sheet.getCell('B6'), { fill: COLORS.blue, fontColor: COLORS.white, bold: true, size: 18, border: false });

  const totalReports = Object.values(diagnostics || {}).reduce((sum, item) => sum + Number(item?.reports || 0), 0);
  const activeProcesses = Object.values(diagnostics || {}).filter((item) => Number(item?.reports || 0) > 0).length;
  const info = [
    ['Nguồn dữ liệu', 'TiDB - production_reports đã duyệt'],
    ['Số báo cáo', totalReports],
    ['Công đoạn có dữ liệu', `${activeProcesses}/9`],
    ['Ngày tạo file', new Date()]
  ];
  info.forEach(([label, value], index) => {
    const row = 10 + index;
    sheet.mergeCells(row, 3, row, 5);
    sheet.mergeCells(row, 6, row, 10);
    sheet.getCell(row, 3).value = label;
    sheet.getCell(row, 6).value = value;
    applyCellStyle(sheet.getCell(row, 3), { fill: COLORS.blueLight, bold: true, align: 'left' });
    applyCellStyle(sheet.getCell(row, 6), { fill: COLORS.white, align: 'left' });
    if (value instanceof Date) sheet.getCell(row, 6).numFmt = 'dd/mm/yyyy hh:mm';
  });
  sheet.mergeCells('C16:J18');
  sheet.getCell('C16').value = 'File được tạo tự động từ dữ liệu quản lý đã duyệt. Không sử dụng dữ liệu minh họa trong file mẫu.';
  applyCellStyle(sheet.getCell('C16'), { fill: COLORS.grayLight, bold: false, align: 'center', border: false });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

function detailColumnWidth(label) {
  const length = asText(label).length;
  if (length <= 5) return 9;
  if (length <= 9) return 11;
  if (length <= 14) return 13;
  if (length <= 20) return 15;
  return 17;
}

function makeColumns(processCode, deductionTypes, defectTypes) {
  const columns = [
    { key: 'stt', header: 'STT', group: 'general', width: 7, format: NUMBER_FORMATS.INTEGER },
    { key: 'entryDate', header: 'Thời gian nhập', group: 'general', width: 18, format: NUMBER_FORMATS.DATETIME },
    { key: 'workerCode', header: 'Mã NV', group: 'general', width: 11 },
    { key: 'workerName', header: 'Tên NV', group: 'general', width: 24, align: 'left' },
    { key: 'shift', header: 'Ca', group: 'general', width: 7 },
    { key: 'operationType', header: 'Loại thao tác', group: 'general', width: 13 },
    { key: 'operationMode', header: 'Chế độ', group: 'general', width: 11 },
    { key: 'machine', header: 'Máy', group: 'general', width: 16, align: 'left' },
    { key: 'product', header: 'Mã SP', group: 'general', width: 18, align: 'left' },
    ...(PROCESS_TEMPLATE_SCHEMAS[processCode]?.extras || []).map((field) => ({
      key: `extra:${field.key}`,
      header: field.header,
      group: 'general',
      width: detailColumnWidth(field.header),
      align: field.kind === 'text' ? 'left' : 'right',
      format: field.kind === 'integer' ? NUMBER_FORMATS.INTEGER : field.kind === 'decimal' ? NUMBER_FORMATS.DECIMAL : field.kind === 'date' ? NUMBER_FORMATS.DATE : undefined
    })),
    { key: 'training', header: '% học việc', group: 'general', width: 9, format: NUMBER_FORMATS.PERCENT },
    { key: 'standard', header: 'Định mức', group: 'general', width: 12, format: NUMBER_FORMATS.RATE },
    { key: 'workingTime', header: 'Tổng thời gian', group: 'time', width: 12, format: NUMBER_FORMATS.DECIMAL },
    { key: 'actualTime', header: 'Thời gian thực tế', group: 'time', width: 12, format: NUMBER_FORMATS.DECIMAL },
    { key: 'deductionTime', header: 'Tổng thời gian trừ', group: 'time', width: 13, format: NUMBER_FORMATS.DECIMAL }
  ];
  deductionTypes.forEach((type) => {
    const header = asText(type.label) || 'Trừ giờ';
    columns.push({
      key: `deduction:${type.key}`,
      header,
      group: 'deduction',
      width: detailColumnWidth(header),
      format: NUMBER_FORMATS.DECIMAL
    });
  });
  columns.push(
    { key: 'ok', header: 'OK', group: 'result', width: 10, format: NUMBER_FORMATS.INTEGER },
    { key: 'ng', header: 'Tổng NG', group: 'result', width: 10, format: NUMBER_FORMATS.INTEGER }
  );
  defectTypes.forEach((type) => {
    const header = asText(type.label) || 'NG';
    columns.push({
      key: `defect:${type.key}`,
      header,
      group: 'defect',
      width: detailColumnWidth(header),
      format: NUMBER_FORMATS.INTEGER
    });
  });
  columns.push(
    { key: 'enteredOutput', header: 'SP công nhân nhập', group: 'summary', width: 15, format: NUMBER_FORMATS.INTEGER },
    { key: 'output', header: 'Tổng SP quy đổi', group: 'summary', width: 14, format: NUMBER_FORMATS.INTEGER },
    { key: 'outputPerHour', header: 'SP/giờ', group: 'summary', width: 10, format: NUMBER_FORMATS.RATE },
    { key: 'achievement', header: 'Tỷ lệ đạt', group: 'summary', width: 11, format: NUMBER_FORMATS.PERCENT },
    { key: 'ngRate', header: 'Tỷ lệ NG', group: 'summary', width: 11, format: NUMBER_FORMATS.PERCENT },
    { key: 'status', header: 'Trạng thái', group: 'summary', width: 13 },
    { key: 'note', header: 'Ghi chú', group: 'summary', width: 28, align: 'left' },
    { key: 'id', header: 'ID', group: 'summary', width: 10, format: NUMBER_FORMATS.INTEGER }
  );
  return columns;
}

function groupStyle(group) {
  if (group === 'general') return { fill: COLORS.blue, light: COLORS.blueLight, label: 'THÔNG TIN CHUNG' };
  if (group === 'time') return { fill: COLORS.orange, light: COLORS.orangeLight, label: 'THỜI GIAN' };
  if (group === 'deduction') return { fill: COLORS.orange, light: COLORS.orangeLight, label: 'CHI TIẾT THỜI GIAN TRỪ' };
  if (group === 'result') return { fill: COLORS.green, light: COLORS.greenLight, label: 'KẾT QUẢ SẢN XUẤT' };
  if (group === 'defect') return { fill: COLORS.red, light: COLORS.redLight, label: 'CHI TIẾT NG' };
  return { fill: COLORS.gray, light: COLORS.grayLight, label: 'TỔNG HỢP' };
}

function setGroupHeader(sheet, columns, processConfig) {
  let start = 1;
  while (start <= columns.length) {
    const group = columns[start - 1].group;
    let end = start;
    while (end < columns.length && columns[end].group === group) end += 1;
    if (end > start) sheet.mergeCells(4, start, 4, end);
    const style = groupStyle(group);
    const cell = sheet.getCell(4, start);
    cell.value = group === 'deduction' ? processConfig.deductionGroup : group === 'defect' ? processConfig.defectGroup : style.label;
    applyCellStyle(cell, { fill: style.fill, fontColor: COLORS.white, bold: true, size: 11 });
    for (let col = start + 1; col <= end; col += 1) {
      const merged = sheet.getCell(4, col);
      merged.fill = solidFill(style.fill);
      merged.border = thinBorder();
    }
    start = end + 1;
  }
}

function parseExtraData(report) {
  if (!report?.extra_data) return {};
  if (typeof report.extra_data === 'object' && !Array.isArray(report.extra_data)) return report.extra_data;
  try { const value = JSON.parse(String(report.extra_data)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

function rowValues(processCode, report, deductionTypes, defectTypes, settings) {
  const snapshot = reportSnapshot(report, settings);
  const deductions = detailMap(report.deductions, 'deduction');
  const defects = detailMap(report.defects, 'defect');
  const extra = parseExtraData(report);
  const values = {
    ...snapshot,
    stt: null
  };
  for (const field of PROCESS_TEMPLATE_SCHEMAS[processCode]?.extras || []) {
    const raw = extra[field.key];
    values[`extra:${field.key}`] = field.kind === 'integer' ? asInteger(raw) : field.kind === 'decimal' ? asNumber(raw) : field.kind === 'date' ? asDate(raw) : asText(raw);
  }
  deductionTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => deductions.get(key))
      .find((item) => item !== undefined);
    values[`deduction:${type.key}`] = value || 0;
  });
  defectTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => defects.get(key))
      .find((item) => item !== undefined);
    values[`defect:${type.key}`] = value || 0;
  });
  return values;
}

function sortReports(reports) {
  return [...(reports || [])].sort((a, b) =>
    dateKey(a.work_date).localeCompare(dateKey(b.work_date)) ||
    reportTimeKey(a).localeCompare(reportTimeKey(b)) ||
    asText(a.worker_code).localeCompare(asText(b.worker_code), undefined, { numeric: true }) ||
    machineDisplay(a).localeCompare(machineDisplay(b), undefined, { numeric: true }) ||
    Number(a.id || 0) - Number(b.id || 0)
  );
}

function settingsForReport(report, fallback = {}, settingsByDate = {}) {
  const key = dateKey(report?.work_date);
  return (key && settingsByDate && settingsByDate[key]) || fallback || {};
}

function headerFontSize(header) {
  const length = asText(header).length;
  if (length <= 5) return 8;
  if (length <= 10) return 7.5;
  if (length <= 16) return 7;
  if (length <= 22) return 6.5;
  return 6;
}

function renderProcessSheet(workbook, code, processConfig, processData, yearMonth, formulaSettings) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const reports = sortReports(processData?.reports);
  const settings = formulaSettings || {};
  const sheet = workbook.addWorksheet(processConfig.sheet, {
    views: [{
      state: 'frozen',
      xSplit: 4,
      ySplit: 5,
      topLeftCell: 'E6',
      activeCell: 'E6',
      showGridLines: false
    }]
  });
  sheet.properties.defaultRowHeight = 20;
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
    excelColumn.width = Math.max(5, Number(column.width) || 8);
  });
  const lastColumn = columns.length;

  sheet.mergeCells(1, 1, 2, lastColumn);
  sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${processConfig.title}`;
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 18, border: false });
  sheet.mergeCells(3, 1, 3, lastColumn);
  const [year, month] = yearMonth.split('-');
  sheet.getCell(3, 1).value = `Tháng ${month}/${year} • Nguồn: TiDB - báo cáo đã duyệt`;
  applyCellStyle(sheet.getCell(3, 1), { fill: COLORS.blueLight, fontColor: COLORS.navy, bold: true, size: 11, border: false });

  setGroupHeader(sheet, columns, processConfig);
  columns.forEach((column, index) => {
    const cell = sheet.getCell(5, index + 1);
    const style = groupStyle(column.group);
    const headerText = asText(column.header) || column.key;

    // Dùng nền sáng + chữ đậm màu tối để tránh lỗi chữ trắng bị ẩn trong Excel/WPS.
    cell.value = headerText;
    cell.numFmt = '@';
    cell.font = {
      name: 'Arial',
      size: headerFontSize(headerText),
      bold: true,
      color: { argb: COLORS.black }
    };
    cell.fill = solidFill(style.light);
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      shrinkToFit: false,
      textRotation: 0
    };
    cell.protection = { locked: true, hidden: false };

    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
  });
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 38;
  sheet.getRow(5).hidden = false;
  sheet.getRow(5).outlineLevel = 0;

  const dataStartRow = 6;
  const numericTotals = new Array(columns.length).fill(0);
  let currentRowNumber = dataStartRow;
  let previousDate = null;
  let sequenceInDate = 0;

  reports.forEach((report, reportIndex) => {
    const currentDate = dateKey(report.work_date);

    // Mỗi ngày bắt đầu bằng đúng một hàng phân cách. Ô A của hàng này
    // ghi ngày báo cáo được chọn trên form (work_date). Không tạo thêm
    // hàng trống riêng và không lặp ngày trên từng dòng dữ liệu.
    if (currentDate !== previousDate) {
      const dateRow = sheet.getRow(currentRowNumber);
      dateRow.height = 22;
      dateRow.hidden = false;
      dateRow.outlineLevel = 0;

      for (let col = 1; col <= lastColumn; col += 1) {
        const cell = dateRow.getCell(col);
        cell.value = null;
        cell.fill = solidFill(col <= 4 ? COLORS.blueLight : COLORS.white);
        cell.border = thinBorder();
      }

      // Chỉ gộp A:D trên hàng phân cách ngày. Các dòng dữ liệu phía dưới
      // vẫn giữ cột A là STT, B là thời gian nhập, C là mã NV và D là tên NV.
      sheet.mergeCells(currentRowNumber, 1, currentRowNumber, 4);

      const reportDate = asDate(report.work_date);
      const dateCell = dateRow.getCell(1);
      dateCell.value = reportDate
        ? `${pad2(reportDate.getDate())}/${pad2(reportDate.getMonth() + 1)}/${reportDate.getFullYear()}`
        : asText(report.work_date);
      dateCell.numFmt = '@';
      applyCellStyle(dateCell, {
        fill: COLORS.blueLight,
        fontColor: COLORS.navy,
        bold: true,
        size: 10,
        align: 'left'
      });
      dateCell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
        indent: 1
      };

      currentRowNumber += 1;
      sequenceInDate = 0;
    }

    sequenceInDate += 1;
    const rowNumber = currentRowNumber;
    const reportSettings = settingsForReport(report, settings, processData?.formulaSettingsByDate || {});
    const values = rowValues(code, report, deductionTypes, defectTypes, reportSettings);
    values.stt = sequenceInDate;

    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      const value = values[column.key];
      cell.value = value === undefined ? null : value;
      if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
      let fill = reportIndex % 2 === 0 ? COLORS.white : 'FFF8FAFC';
      let bold = false;
      let fontColor = COLORS.black;
      const machineMode = asText(report.operation_mode).toUpperCase() === 'MACHINE';
      const editableCore = machineMode
        ? new Set(['training','note'])
        : new Set(['shift','machine','product','training','actualTime','ok','note']);
      const editableCell = editableCore.has(column.key) || (!machineMode && (column.key.startsWith('deduction:') || column.key.startsWith('defect:')));
      if (editableCell) fill = COLORS.warning;

      if (column.group === 'deduction') {
        fill = numericValue !== null && numericValue > 0 ? COLORS.orangeLight : (editableCell ? COLORS.warning : COLORS.white);
        bold = numericValue !== null && numericValue > 0;
        fontColor = numericValue !== null && numericValue > 0 ? 'FF9C5700' : COLORS.black;
      } else if (column.group === 'defect') {
        fill = numericValue !== null && numericValue > 0 ? COLORS.redLight : (editableCell ? COLORS.warning : COLORS.white);
        bold = numericValue !== null && numericValue > 0;
        fontColor = numericValue !== null && numericValue > 0 ? COLORS.red : COLORS.black;
      }

      applyCellStyle(cell, {
        fill,
        fontColor,
        bold,
        size: 8,
        align: column.align || (typeof value === 'number' ? 'right' : 'center'),
        wrap: Boolean(column.wide),
        shrink: false
      });
      if (editableCell) cell.protection = { locked: false, hidden: false };

      if (column.key === 'achievement') {
        const achievementFill = achievementColor(value, reportSettings);
        if (achievementFill) cell.fill = solidFill(achievementFill);
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      } else if (column.key === 'status' && asText(value).toLowerCase() === 'approved') {
        cell.fill = solidFill(COLORS.greenLight);
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      }

      if (typeof value === 'number' && Number.isFinite(value)) numericTotals[columnIndex] += value;
    });

    previousDate = currentDate;
    currentRowNumber += 1;
  });

  const totalRowNumber = currentRowNumber;
  const totalLabelEnd = Math.min(10, lastColumn);
  if (totalLabelEnd > 1) sheet.mergeCells(totalRowNumber, 1, totalRowNumber, totalLabelEnd);
  const totalLabel = sheet.getCell(totalRowNumber, 1);
  totalLabel.value = 'TỔNG CỘNG';
  applyCellStyle(totalLabel, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 11, align: 'left' });
  for (let col = 2; col <= totalLabelEnd; col += 1) {
    sheet.getCell(totalRowNumber, col).fill = solidFill(COLORS.navy);
    sheet.getCell(totalRowNumber, col).border = thinBorder();
  }
  const nonTotalKeys = new Set(['stt','entryDate','workerCode','workerName','shift','operationType','operationMode','machine','product','training','standard','outputPerHour','achievement','ngRate','status','note','id']);
  columns.forEach((column, index) => {
    if (index + 1 <= totalLabelEnd) return;
    const cell = sheet.getCell(totalRowNumber, index + 1);
    const value = nonTotalKeys.has(column.key) ? null : numericTotals[index];
    cell.value = value;
    if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
    applyCellStyle(cell, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, align: 'right' });
  });
  sheet.getRow(totalRowNumber).height = 24;
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRowNumber - 1), column: lastColumn } };
  sheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
    margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  };
  sheet.headerFooter = { oddFooter: '&LKTC Production Control&CTrang &P / &N&R&D &T' };
  // All Borders cho toàn bộ vùng bảng: header nhóm, header cột, hàng ngày, dữ liệu và tổng cộng.
  applyAllBorders(sheet, { fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn });
  return { code, sheet: processConfig.sheet, reportCount: reports.length, deductionColumnCount: deductionTypes.length, defectColumnCount: defectTypes.length };
}

function addSummary(workbook, payload, yearMonth) {
  const sheet = workbook.addWorksheet('TỔNG HỢP THÁNG', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  const columns = [
    ['Công đoạn', 24], ['Số báo cáo', 12], ['Số nhân viên', 14], ['Tổng thời gian', 16], ['Thời gian thực tế', 16],
    ['Tổng thời gian trừ', 14], ['Tổng OK', 12], ['Tổng NG', 12], ['Tổng SP', 12], ['Tỷ lệ NG', 12]
  ];
  columns.forEach(([, width], index) => { sheet.getColumn(index + 1).width = width; });
  sheet.mergeCells(1, 1, 2, columns.length);
  sheet.getCell(1, 1).value = `TỔNG HỢP BÁO CÁO SẢN XUẤT THÁNG ${yearMonth.slice(5, 7)}/${yearMonth.slice(0, 4)}`;
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 18, border: false });
  columns.forEach(([header], index) => {
    sheet.getCell(4, index + 1).value = header;
    applyCellStyle(sheet.getCell(4, index + 1), { fill: COLORS.blue, fontColor: COLORS.white, bold: true });
  });
  let rowNumber = 5;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const reports = sortReports(processData.reports);
    const employees = new Set(reports.map((item) => asText(item.worker_code)).filter(Boolean));
    const settings = formulaSettingsFor(payload, code);
    const totals = reports.reduce((sum, report) => {
      const itemSettings = settingsForReport(report, settings, processData.formulaSettingsByDate || {});
      const item = reportSnapshot(report, itemSettings);
      sum.working += item.workingTime || 0;
      sum.actual += item.actualTime || 0;
      sum.deduction += item.deductionTime || 0;
      sum.ok += item.ok || 0;
      sum.ng += item.ng || 0;
      sum.output += item.output || 0;
      return sum;
    }, { working: 0, actual: 0, deduction: 0, ok: 0, ng: 0, output: 0 });
    const values = [config.title, reports.length, employees.size, totals.working, totals.actual, totals.deduction, totals.ok, totals.ng, totals.output, totals.ok + totals.ng > 0 ? totals.ng / (totals.ok + totals.ng) : null];
    values.forEach((value, index) => {
      const cell = sheet.getCell(rowNumber, index + 1);
      cell.value = value;
      if ([1, 2, 6, 7, 8].includes(index)) cell.numFmt = NUMBER_FORMATS.INTEGER;
      if (index >= 3 && index <= 5) cell.numFmt = resolvedNumberFormat(value, NUMBER_FORMATS.DECIMAL);
      if (index === 9) cell.numFmt = NUMBER_FORMATS.PERCENT;
      applyCellStyle(cell, { fill: rowNumber % 2 ? COLORS.white : COLORS.blueLight, align: index === 0 ? 'left' : 'right' });
    });
    rowNumber += 1;
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  applyAllBorders(sheet, { fromRow: 4, toRow: rowNumber - 1, fromCol: 1, toCol: columns.length });
  return sheet;
}

function addReconciliationSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('ĐỐI CHIẾU DỮ LIỆU', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  const headers = ['Công đoạn','ID','Ngày','Mã NV','Tên NV','Tổng TG trừ','Cộng chi tiết trừ','Chênh lệch TG','Tổng NG','Cộng chi tiết NG','Chênh lệch NG','Kết quả'];
  headers.forEach((header, index) => {
    sheet.getCell(3, index + 1).value = header;
    applyCellStyle(sheet.getCell(3, index + 1), { fill: COLORS.gray, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = [20,10,13,11,24,14,17,14,11,16,13,12][index];
  });
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = 'ĐỐI CHIẾU DỮ LIỆU TIỂU TIẾT VỚI BÁO CÁO ĐÃ DUYỆT';
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 16, border: false });
  let rowNumber = 4;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const item = reportSnapshot(report, itemSettings);
      const detailDeduction = (report.deductions || []).reduce((sum, value) => sum + (detailValue(value, 'deduction') || 0), 0);
      const detailNg = (report.defects || []).reduce((sum, value) => sum + (detailValue(value, 'defect') || 0), 0);
      const deductionDiff = (item.deductionTime || 0) - detailDeduction;
      const ngDiff = (item.ng || 0) - detailNg;
      const ok = Math.abs(deductionDiff) < 0.0001 && Math.abs(ngDiff) < 0.0001;
      const values = [config.title,item.id,item.date,item.workerCode,item.workerName,item.deductionTime,detailDeduction,deductionDiff,item.ng,detailNg,ngDiff,ok?'OK':'LỆCH'];
      values.forEach((value, index) => {
        const cell = sheet.getCell(rowNumber, index + 1);
        cell.value = value;
        if (index === 1 || [8,9,10].includes(index)) cell.numFmt = NUMBER_FORMATS.INTEGER;
        if (index === 2) cell.numFmt = NUMBER_FORMATS.DATE;
        if ([5,6,7].includes(index)) cell.numFmt = resolvedNumberFormat(value, NUMBER_FORMATS.DECIMAL);
        applyCellStyle(cell, { fill: ok ? COLORS.white : COLORS.warning, align: [0,4].includes(index) ? 'left' : 'right' });
      });
      rowNumber += 1;
    }
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  applyAllBorders(sheet, { fromRow: 3, toRow: rowNumber - 1, fromCol: 1, toCol: headers.length });
  return sheet;
}



const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

function operationTypeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['CUT','CẮT','CAT'].includes(text)) return 'CẮT';
  if (['NEST','LỒNG','LONG'].includes(text)) return 'LỒNG';
  return '';
}

function operationModeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE','MÁY','MAY'].includes(text)) return 'MÁY';
  if (['MANUAL','TAY','THỦ CÔNG','THU CONG'].includes(text)) return 'TAY';
  return '';
}

function addGcModeHelperSheet(workbook, dataSheet, processData, columns) {
  const helper = workbook.addWorksheet(GC_HELPER_SHEET, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  helper.mergeCells('A1:J1');
  helper.getCell('A1').value = 'BỔ SUNG THÔNG TIN TAY/MÁY - CẮT/LỒNG';
  applyCellStyle(helper.getCell('A1'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 15, border: false });
  helper.mergeCells('A2:J2');
  helper.getCell('A2').value = 'Sheet này tự cập nhật từ CẮT LỒNG ngay khi file Excel thay đổi. Với dòng mới, chỉ cần bổ sung Loại thao tác, Chế độ và Máy nếu chọn MÁY.';
  applyCellStyle(helper.getCell('A2'), { fill: COLORS.blueLight, fontColor: COLORS.navy, bold: false, size: 10, border: false, align: 'left' });
  const headers = ['Dòng nguồn','ID','Mã NV','Ca','Mã SP','Loại thao tác','Chế độ','Máy','Trạng thái','Thiếu thông tin'];
  headers.forEach((h,i)=>{ helper.getCell(3,i+1).value=h; applyCellStyle(helper.getCell(3,i+1), { fill: COLORS.blue, fontColor: COLORS.white, bold: true }); });
  [12,10,12,8,18,16,12,18,18,32].forEach((w,i)=>helper.getColumn(i+1).width=w);

  const columnNumberByKey = (key) => {
    const index = columns.findIndex((column) => column.key === key);
    return index >= 0 ? index + 1 : 0;
  };
  const idCol = columnNumberByKey('id');
  const workerCol = columnNumberByKey('workerCode');
  const shiftCol = columnNumberByKey('shift');
  const productCol = columnNumberByKey('product');
  const operationTypeCol = columnNumberByKey('operationType');
  const operationModeCol = columnNumberByKey('operationMode');
  const machineCol = columnNumberByKey('machine');

  // Helper row 4 maps to source row 6, row 5 -> source row 7, ...
  // Pre-seed enough formula rows so rows added manually in Excel appear immediately
  // without needing Electron/EXE to regenerate the helper sheet first.
  // STT số nguyên dương là điều kiện duy nhất để một dòng nguồn xuất hiện ở sheet phụ.
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const MAX_AUTO_SOURCE_ROW = Math.max(2000, dataSheet.rowCount + 500);
  const dataSheetName = String(dataSheet.name || 'CẮT LỒNG').replace(/'/g, "''");
  const sourceRef = (row, col) => `'${dataSheetName}'!${dataSheet.getColumn(col).letter}${row}`;

  for (let sourceRow = 6; sourceRow <= MAX_AUTO_SOURCE_ROW; sourceRow += 1) {
    const outRow = sourceRow - 2;
    const sttRef = sourceRef(sourceRow, 1);
    const validExpr = `AND(ISNUMBER(${sttRef}),${sttRef}>0)`;
    const formula = (expr) => ({ formula: `IF(${validExpr},${expr},\"\")` });

    helper.getCell(outRow, 1).value = formula(sourceRow);
    helper.getCell(outRow, 2).value = idCol ? formula(sourceRef(sourceRow, idCol)) : '';
    helper.getCell(outRow, 3).value = workerCol ? formula(sourceRef(sourceRow, workerCol)) : '';
    helper.getCell(outRow, 4).value = shiftCol ? formula(sourceRef(sourceRow, shiftCol)) : '';
    helper.getCell(outRow, 5).value = productCol ? formula(sourceRef(sourceRow, productCol)) : '';

    if (operationTypeCol) {
      const ref = sourceRef(sourceRow, operationTypeCol);
      helper.getCell(outRow, 6).value = { formula: `IF(${validExpr},IF(OR(UPPER(${ref})=\"CUT\",UPPER(${ref})=\"CẮT\",UPPER(${ref})=\"CAT\"),\"CẮT\",IF(OR(UPPER(${ref})=\"NEST\",UPPER(${ref})=\"LỒNG\",UPPER(${ref})=\"LONG\"),\"LỒNG\",\"\")),\"\")` };
    }
    if (operationModeCol) {
      const ref = sourceRef(sourceRow, operationModeCol);
      helper.getCell(outRow, 7).value = { formula: `IF(${validExpr},IF(OR(UPPER(${ref})=\"MACHINE\",UPPER(${ref})=\"MÁY\",UPPER(${ref})=\"MAY\"),\"MÁY\",IF(OR(UPPER(${ref})=\"MANUAL\",UPPER(${ref})=\"TAY\"),\"TAY\",\"\")),\"\")` };
    }
    helper.getCell(outRow, 8).value = machineCol ? formula(sourceRef(sourceRow, machineCol)) : '';

    // Status is calculated from the helper cells themselves so manual selections in F:G:H
    // immediately update the message without any EXE action.
    helper.getCell(outRow, 9).value = { formula: `IF($A${outRow}=\"\",\"\",IF(OR($F${outRow}=\"\",$G${outRow}=\"\",AND($G${outRow}=\"MÁY\",$H${outRow}=\"\")),\"THIẾU THÔNG TIN\",\"ĐỦ THÔNG TIN\"))` };
    helper.getCell(outRow, 10).value = { formula: `IF($A${outRow}=\"\",\"\",IF($F${outRow}=\"\",\"Loại thao tác\",\"\")&IF(AND($F${outRow}=\"\",$G${outRow}=\"\"),\", \",\"\")&IF($G${outRow}=\"\",\"Chế độ\",\"\")&IF(AND($G${outRow}=\"MÁY\",$H${outRow}=\"\"),IF(OR($F${outRow}=\"\",$G${outRow}=\"\"),\", Máy\",\"Máy\"),\"\"))` };

    for (let col = 1; col <= 10; col += 1) {
      applyCellStyle(helper.getCell(outRow, col), { fill: outRow % 2 ? COLORS.white : COLORS.blueLight, align: [3,5,10].includes(col) ? 'left' : 'center' });
    }
    helper.getCell(outRow, 6).dataValidation = { type:'list', allowBlank:true, formulae:['"CẮT,LỒNG"'] };
    helper.getCell(outRow, 7).dataValidation = { type:'list', allowBlank:true, formulae:['"TAY,MÁY"'] };
    helper.getCell(outRow, 6).protection = { locked:false };
    helper.getCell(outRow, 7).protection = { locked:false };
    helper.getCell(outRow, 8).protection = { locked:false };
  }
  applyAllBorders(helper, { fromRow:3, toRow:MAX_AUTO_SOURCE_ROW - 2, fromCol:1, toCol:10 });
  return helper;
}

function typeIdFromSyncKey(key) {
  const match = String(key || '').match(/^id:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function syncOriginalPatch(report) {
  return {
    shift: asText(report.shift),
    operation_type: asText(report.operation_type),
    operation_mode: asText(report.operation_mode),
    machine_no: asText(report.machine_no),
    product_name: asText(report.product_name),
    training_percent: Number.isFinite(Number(report.training_percent)) ? Number(report.training_percent) : 100,
    actual_time: asNumber(report.actual_time),
    tt_ok: asInteger(report.tt_ok),
    note: asText(report.note),
    deductions: (report.deductions || []).map((item) => ({
      deduction_type_id: detailId(item, 'deduction'),
      hours: detailValue(item, 'deduction') || 0
    })).filter((item) => item.deduction_type_id),
    defects: (report.defects || []).map((item) => ({
      defect_type_id: detailId(item, 'defect'),
      quantity: detailValue(item, 'defect') || 0
    })).filter((item) => item.defect_type_id)
  };
}

function addExcelDbSyncMetadata(workbook, code, processConfig, processData, yearMonth) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const editable = columns.map((column, index) => {
    const entry = { index: index + 1, key: column.key, header: column.header };
    if (column.key.startsWith('deduction:')) entry.typeId = typeIdFromSyncKey(column.key.slice('deduction:'.length));
    if (column.key.startsWith('defect:')) entry.typeId = typeIdFromSyncKey(column.key.slice('defect:'.length));
    return entry;
  });
  const sheet = workbook.addWorksheet('_KTC_SYNC');
  sheet.state = 'veryHidden';
  sheet.getCell('A1').value = JSON.stringify({
    version: 1,
    processCode: code,
    sheetName: processConfig.sheet,
    generatedAt: new Date().toISOString(),
    yearMonth,
    gcHelperSheet: code === 'GC' ? GC_HELPER_SHEET : null,
    columns: editable
  });
  sheet.addRow(['report_id', 'expected_updated_at', 'operation_mode', 'original_json']);
  for (const report of processData?.reports || []) {
    sheet.addRow([
      Number(report.id),
      report.updated_at || report.created_at || null,
      asText(report.operation_mode).toUpperCase(),
      JSON.stringify(syncOriginalPatch(report))
    ]);
  }
}

async function buildMonthlyWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  const results = [];
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    results.push(renderProcessSheet(workbook, code, config, payload.processes?.[code] || {}, yearMonth, formulaSettingsFor(payload, code)));
  }
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, results, formulaReplacementCount: 0 };
}


/**
 * Tạo một workbook chỉ chứa đúng một sheet công đoạn.
 * Dùng cho Desktop để mỗi công đoạn là một file Excel độc lập, nhẹ và dễ mở/chỉnh.
 */
async function buildProcessWorkbookLocal({ date, payload, processCode }) {
  assertApprovedDatabasePayload(payload);
  const code = String(processCode || '').trim().toUpperCase();
  const config = PROCESS_SHEETS[code];
  if (!config) throw new Error(`Công đoạn không hợp lệ: ${processCode}`);

  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  const processData = payload.processes?.[code] || {};
  const result = renderProcessSheet(
    workbook,
    code,
    config,
    processData,
    yearMonth,
    formulaSettingsFor(payload, code)
  );
  if (code === 'GC') {
    const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
    const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
    addGcModeHelperSheet(workbook, workbook.getWorksheet(config.sheet), processData, makeColumns(code, deductionTypes, defectTypes));
  }
  addExcelDbSyncMetadata(workbook, code, config, processData, yearMonth);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    result,
    processCode: code,
    processName: config.title,
    fileName: processWorkbookFileName(code, date, payload),
    formulaReplacementCount: 0
  };
}

/**
 * File số 00: chỉ giữ thông tin chung của tháng. Các sheet công đoạn được tách
 * hoàn toàn sang 9 file riêng để không phải mở một workbook quá rộng/nặng.
 */
async function buildMonthlySummaryWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: summaryWorkbookFileName(date, payload),
    formulaReplacementCount: 0
  };
}

async function buildSplitMonthlyWorkbooksLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const summary = await buildMonthlySummaryWorkbookLocal({ date, payload });
  const processes = [];
  for (const code of Object.keys(PROCESS_SHEETS)) {
    processes.push(await buildProcessWorkbookLocal({ date, payload, processCode: code }));
  }
  return { summary, processes };
}

async function buildReconciliationWorkbook({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  const sheet = workbook.addWorksheet('DATA_DB', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Công đoạn','ID','Ngày báo cáo','Ngày nhập','Mã NV','Tên NV','Ca','Máy','Mã SP','% học việc','Định mức','Tổng thời gian','Thời gian thực tế','Tổng thời gian trừ','OK','NG','SP công nhân nhập','Tổng SP quy đổi','Trừ giờ JSON','NG JSON','Máy JSON','Trạng thái','Ghi chú'];
  sheet.addRow(headers);
  headers.forEach((_, index) => {
    applyCellStyle(sheet.getCell(1, index + 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = index >= 18 && index <= 20 ? 35 : [20,10,13,13,11,24,7,18,18,11,12,12,12,12,10,10,14,14][index] || 14;
  });
  let count = 0;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const value = reportSnapshot(report, itemSettings);
      const row = sheet.addRow([config.title,value.id,value.date,value.entryDate,value.workerCode,value.workerName,value.shift,value.machine,value.product,value.training,value.standard,value.workingTime,value.actualTime,value.deductionTime,value.ok,value.ng,value.enteredOutput,value.output,JSON.stringify(report.deductions || []),JSON.stringify(report.defects || []),JSON.stringify(report.machineLines || []),report.status,value.note]);
      row.getCell(2).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(3).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(4).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(10).numFmt = NUMBER_FORMATS.PERCENT;
      row.getCell(11).numFmt = resolvedNumberFormat(value.standard, NUMBER_FORMATS.RATE);
      row.getCell(12).numFmt = resolvedNumberFormat(value.workingTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(13).numFmt = resolvedNumberFormat(value.actualTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(14).numFmt = resolvedNumberFormat(value.deductionTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(15).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(16).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(17).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(18).numFmt = NUMBER_FORMATS.INTEGER;
      row.eachCell((cell, column) => applyCellStyle(cell, { fill: count % 2 ? COLORS.blueLight : COLORS.white, align: [1,6,8,9,19,20,21,23].includes(column) ? 'left' : 'center' }));
      count += 1;
    }
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, count + 1), column: headers.length } };
  applyAllBorders(sheet, { fromRow: 1, toRow: Math.max(1, count + 1), fromCol: 1, toCol: headers.length });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, rowCount: count };
}

module.exports = {
  buildMonthlyWorkbookLocal,
  buildProcessWorkbookLocal,
  buildMonthlySummaryWorkbookLocal,
  buildSplitMonthlyWorkbooksLocal,
  buildReconciliationWorkbook,
  PROCESS_SHEETS,
  PROCESS_FILE_PREFIXES,
  processWorkbookFileName,
  summaryWorkbookFileName,
  _private: {
    assertApprovedDatabasePayload,
    normalize,
    reportSnapshot,
    detailKey,
    processDetailTypes,
    makeColumns,
    renderProcessSheet,
    sortReports,
    trainingFactor,
    countedNg,
    reportTimeKey,
    applyAllBorders
  }
};
