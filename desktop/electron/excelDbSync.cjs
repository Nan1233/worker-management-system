const ExcelJS = require('exceljs');
const { EXCEL_SYNC_CONTRACT_VERSION, isExcelMutableField } = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs') : '../../shared/excelSyncContract.cjs');
const path = require('node:path');
const { PROCESS_CODES } = require('./monthlyExcelContract.cjs');
const {
  asText,
  asNumber,
  asInteger,
  stableValue,
  same,
  normalizeOperationMode,
  normalizeOperationType,
  excelDateToIso,
  detailColumns,
  normalizeDetailList,
  mergeEditableDetails,
  normalizeEditable,
  comparable,
  fieldValue,
} = require('./excelDbSyncValues.cjs');

const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

function gcHelperRowValue(sheet, row) {
  return {
    helperRow: row,
    sourceRow: asInteger(sheet.getCell(row, 1).value),
    reportId: asInteger(sheet.getCell(row, 2).value),
    workerCode: asText(sheet.getCell(row, 3).value),
    shift: asText(sheet.getCell(row, 4).value),
    product: asText(sheet.getCell(row, 5).value),
    operationType: normalizeOperationType(sheet.getCell(row, 6).value),
    operationMode: normalizeOperationMode(sheet.getCell(row, 7).value),
    machine: asText(sheet.getCell(row, 8).value) || null
  };
}

function parseGcHelperSheet(workbook) {
  const sheet = workbook.getWorksheet(GC_HELPER_SHEET);
  if (!sheet) return { sheet: null, byId: new Map(), bySourceRow: new Map() };
  const byId = new Map();
  const bySourceRow = new Map();
  for (let row = 4; row <= sheet.rowCount; row += 1) {
    const item = gcHelperRowValue(sheet, row);
    if (item.reportId > 0) {
      if(byId.has(item.reportId))throw Object.assign(new Error('Trùng ID trong sheet hỗ trợ GC.'),{code:'EXCEL_SYNC_HELPER_DUPLICATE'});
      byId.set(item.reportId,item);
    }
    if (item.sourceRow > 0) {
      if(bySourceRow.has(item.sourceRow))throw Object.assign(new Error('Trùng dòng nguồn trong sheet hỗ trợ GC.'),{code:'EXCEL_SYNC_HELPER_DUPLICATE'});
      bySourceRow.set(item.sourceRow,item);
    }
  }
  return { sheet, byId, bySourceRow };
}

function gcMissingFields(operationType, operationMode, machine) {
  const missing = [];
  if (!['CUT','NEST'].includes(operationType || '')) missing.push('Loại thao tác (CẮT/LỒNG)');
  if (!['MANUAL','MACHINE'].includes(operationMode || '')) missing.push('Chế độ (TAY/MÁY)');
  if (operationMode === 'MACHINE' && !asText(machine)) missing.push('Máy');
  return missing;
}

function helperDisplayType(value) { return value === 'CUT' ? 'CẮT' : value === 'NEST' ? 'LỒNG' : ''; }
function helperDisplayMode(value) { return value === 'MACHINE' ? 'MÁY' : value === 'MANUAL' ? 'TAY' : ''; }

function upsertGcHelperRow(helper, { sourceRow, reportId, workerCode, shift, product, operationType, operationMode, machine }) {
  if (!helper.sheet) return false;
  let item = (reportId > 0 ? helper.byId.get(reportId) : null) || helper.bySourceRow.get(sourceRow);
  let row = item?.helperRow;
  if (!row) row = Math.max(4, helper.sheet.rowCount + 1);
  const currentType = item?.operationType || operationType || null;
  const currentMode = item?.operationMode || operationMode || null;
  const currentMachine = item?.machine || machine || null;
  const missing = gcMissingFields(currentType, currentMode, currentMachine);
  const values = [sourceRow, reportId > 0 ? reportId : '', workerCode, shift, product, helperDisplayType(currentType), helperDisplayMode(currentMode), currentMachine || '', missing.length ? 'THIẾU THÔNG TIN' : 'ĐỦ THÔNG TIN', missing.join(', ')];
  const beforeValues = values.map((_, index) => helper.sheet.getCell(row, index + 1).value);
  values.forEach((value, index) => { helper.sheet.getCell(row, index + 1).value = value; });
  helper.sheet.getCell(row, 6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"CẮT,LỒNG"'] };
  helper.sheet.getCell(row, 7).dataValidation = { type: 'list', allowBlank: true, formulae: ['"TAY,MÁY"'] };
  const updated = gcHelperRowValue(helper.sheet, row);
  if (updated.reportId > 0) helper.byId.set(updated.reportId, updated);
  if (updated.sourceRow > 0) helper.bySourceRow.set(updated.sourceRow, updated);
  return !item || !same(beforeValues, values);
}

function parseMeta(workbook) {
  const metaSheet = workbook.getWorksheet('_KTC_SYNC');
  if (!metaSheet) return null;
  let config;
  try { config = JSON.parse(String(metaSheet.getCell('A1').value || '')); } catch {throw Object.assign(new Error('Metadata Excel không đọc được.'),{code:'EXCEL_SYNC_META_INVALID'});}
  if (!config?.sheetName || !Array.isArray(config?.columns) || !PROCESS_CODES.includes(config.processCode)
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(config.yearMonth||'')))throw Object.assign(new Error('Metadata Excel thiếu công đoạn, tháng hoặc cột dữ liệu.'),{code:'EXCEL_SYNC_META_INVALID'});
  if(config.columns.some(col=>!col||typeof col.key!=='string'||!Number.isSafeInteger(col.index)||col.index<1||col.index>16384)
    ||new Set(config.columns.map(col=>col.index)).size!==config.columns.length||new Set(config.columns.map(col=>col.key)).size!==config.columns.length)throw Object.assign(new Error('Ánh xạ cột metadata bị trùng hoặc sai.'),{code:'EXCEL_SYNC_META_INVALID'});
  if (String(config.version || '') !== EXCEL_SYNC_CONTRACT_VERSION) {
    const error = new Error('File Excel đang dùng contract cũ. Hãy chạy Bước 1: Cập nhật Excel từ DB trước khi cập nhật DB từ Excel.');
    error.code = 'EXCEL_SYNC_CONTRACT_OUTDATED';
    throw error;
  }
  const reports = new Map();
  const machineLineIds = new Set();
  for (let row = 3; row <= metaSheet.rowCount; row += 1) {
    const id = Number(metaSheet.getCell(row, 1).value);
    if (!Number.isSafeInteger(id) || id <= 0) {
      if(metaSheet.getCell(row,1).value!=null)throw Object.assign(new Error('ID metadata không hợp lệ.'),{code:'EXCEL_SYNC_META_INVALID'});
      continue;
    }
    const rawLine=metaSheet.getCell(row,9).value;
    const machineLineId=rawLine==null||rawLine===''?null:Number(rawLine);
    if(machineLineId!==null&&(config.rowIdentityMode!=='KTC_SYNC_ROW_V2'||config.processCode!=='GC'||!Number.isSafeInteger(machineLineId)||machineLineId<=0))throw Object.assign(new Error('ID dòng máy không hợp lệ.'),{code:'EXCEL_SYNC_META_INVALID'});
    if (machineLineId !== null) {
      if (machineLineIds.has(machineLineId)) throw Object.assign(new Error('Trùng ID dòng máy trong metadata.'), {code:'EXCEL_SYNC_DUPLICATE_META_ID'});
      machineLineIds.add(machineLineId);
    }
    const identity=machineLineId===null?id:'machine:'+id+':'+machineLineId;
    // Duplicate IDs in hidden lineage can silently overwrite an earlier
    // snapshot and route edits to the wrong approved report. Fail closed.
    if (reports.has(identity)) {
      const error = new Error('Sheet _KTC_SYNC chứa ID báo cáo trùng. Hãy xuất lại Excel từ DB.');
      error.code = 'EXCEL_SYNC_DUPLICATE_META_ID';
      throw error;
    }
    let original = {};
    try { original = JSON.parse(String(metaSheet.getCell(row, 4).value || '{}')); } catch {throw Object.assign(new Error('Snapshot metadata không hợp lệ.'),{code:'EXCEL_SYNC_META_INVALID'});}
    if(!original||typeof original!=='object'||Array.isArray(original))throw Object.assign(new Error('Snapshot metadata không hợp lệ.'),{code:'EXCEL_SYNC_META_INVALID'});
    if(machineLineId!==null&&(!Array.isArray(original.excel_readonly_cells)||!original.excel_readonly_cells.length))throw Object.assign(new Error('Thiếu snapshot dòng máy.'),{code:'EXCEL_SYNC_META_INVALID'});
    reports.set(identity, {
      reportId:id,machineLineId,
      expectedUpdatedAt: metaSheet.getCell(row, 2).value instanceof Date ? metaSheet.getCell(row,2).value.toISOString() : asText(metaSheet.getCell(row, 2).value)||null,
      operationMode: asText(metaSheet.getCell(row, 3).value).toUpperCase(),
      sourceRow: Number(metaSheet.getCell(row, 5).value || 0),
      workerCode: asText(metaSheet.getCell(row, 6).value),
      workDate: asText(metaSheet.getCell(row, 7).value),
      sourceStt: Number(metaSheet.getCell(row, 8).value || 0),
      original
    });
  }
  return { config, reports };
}

function currentByKey(sheet, row, columns) {
  const output = {};
  for (const col of columns) output[col.key] = sheet.getCell(row, col.index).value;
  return output;
}

async function readExcelChanges(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const meta = parseMeta(workbook);
  if (!meta) return { managed: false, changes: [] };
  const sheet = workbook.getWorksheet(meta.config.sheetName);
  if (!sheet) throw new Error(`Không tìm thấy sheet dữ liệu ${meta.config.sheetName}`);
  const gcHelper = meta.config.processCode === 'GC' ? parseGcHelperSheet(workbook) : null;
  let helperDirty = false;
  const idColumn = meta.config.columns.find((col) => col.key === 'id');
  const paperRows = !idColumn && ['KTC_SYNC_ROW_V1','KTC_SYNC_ROW_V2'].includes(meta.config.rowIdentityMode);
  if (!idColumn && !paperRows) {
    // Legacy paper exports cannot be safely joined to report IDs. Require a
    // fresh export rather than guessing by row position or worker name.
    const error = new Error('Mẫu Excel cũ thiếu ánh xạ ID. Hãy xuất lại Excel từ DB trước khi đồng bộ.');
    error.code = 'EXCEL_SYNC_ROW_IDENTITY_MISSING';
    throw error;
  }
  const firstRow = paperRows ? Number(meta.config.firstDataRow) - 1 : Number(meta.config.firstDataRow || 6);
  if (!Number.isSafeInteger(firstRow) || firstRow < 1) {
    const error = new Error('Mẫu Excel thiếu thông tin dòng bắt đầu.');
    error.code = 'EXCEL_SYNC_ROW_IDENTITY_INVALID';
    throw error;
  }

  const dateColumn=meta.config.columns.find(col=>col.key==='date');
  const explicitIdentity=meta.config.rowIdentityMode==='KTC_SYNC_ID_V1';
  const rowById = new Map();
  const rowDate = new Map();
  const knownPaperRows = new Set();
  let activeDate = null;
  for (let row = firstRow; row <= sheet.rowCount; row += 1) {
    const first = sheet.getCell(row, 1).value;
    const parsedDate = excelDateToIso(first);
    if (parsedDate && !Number.isInteger(Number(first))) { activeDate = parsedDate; continue; }
    if (paperRows) {
      if (activeDate) rowDate.set(row, activeDate);
      continue;
    }
    const id = Number(sheet.getCell(row, idColumn.index).value);
    if (Number.isSafeInteger(id) && id > 0) {
      if (rowById.has(id)) {
        const error = new Error('File Excel chứa ID báo cáo lặp.');
        error.code = 'EXCEL_SYNC_DUPLICATE_ID';
        throw error;
      }
      rowById.set(id, row);
    }
    const explicitDate=explicitIdentity&&dateColumn?excelDateToIso(sheet.getCell(row,dateColumn.index).value):null;
    if(explicitIdentity&&activeDate&&explicitDate&&activeDate!==explicitDate)throw Object.assign(new Error('Ngày sản xuất không khớp dòng phân ngày.'),{code:'EXCEL_SYNC_ROW_IDENTITY_MISMATCH'});
    if (activeDate || explicitDate) rowDate.set(row, activeDate || explicitDate);
  }
  if (paperRows) {
    for (const [id, saved] of meta.reports.entries()) {
      const row = saved.sourceRow;
      if (!Number.isSafeInteger(row) || row < firstRow + 1 || row > sheet.rowCount ||
          knownPaperRows.has(row) || !saved.workerCode || !saved.workDate ||
          !Number.isSafeInteger(saved.sourceStt) || saved.sourceStt < 1) {
        const error = new Error('Ánh xạ ID / dòng trong _KTC_SYNC không hợp lệ.');
        error.code = 'EXCEL_SYNC_ROW_IDENTITY_INVALID';
        throw error;
      }
      knownPaperRows.add(row);
      const current = currentByKey(sheet, row, meta.config.columns);
      if (asText(current.workerCode) !== saved.workerCode ||
          rowDate.get(row) !== saved.workDate ||
          Number(sheet.getCell(row, 1).value) !== saved.sourceStt) {
        // Moving/reordering paper rows must never change which approved
        // report is updated; refuse the whole import before creating a patch.
        const error = new Error('Dòng Excel đã bị di chuyển hoặc thay đổi mã NV, ngày, STT. Hãy xuất lại file từ DB.');
        error.code = 'EXCEL_SYNC_ROW_IDENTITY_MISMATCH';
        throw error;
      }
      rowById.set(id, row);
    }
  }

  const changes = [];
  for (const [id, reportMeta] of meta.reports.entries()) {
    const row = rowById.get(id);
    if (!row) continue; // Không dùng Excel để xóa báo cáo; xóa phải qua UI có audit reason.
    const current = currentByKey(sheet, row, meta.config.columns);
    current.workDate = rowDate.get(row) || null;
    if(explicitIdentity && (asText(current.workerCode)!==reportMeta.workerCode || current.workDate!==reportMeta.workDate))throw Object.assign(new Error('Mã công nhân hoặc ngày của dòng Excel không khớp snapshot.'),{code:'EXCEL_SYNC_ROW_IDENTITY_MISMATCH'});
    const helperItem = gcHelper ? (gcHelper.bySourceRow.get(row) || gcHelper.byId.get(id)) : null;
    if(dateColumn&&current.date!=null&&excelDateToIso(current.date)!==current.workDate)throw Object.assign(new Error('Ngày sản xuất trên dòng không khớp snapshot.'),{code:'EXCEL_SYNC_ROW_IDENTITY_MISMATCH'});
    if(helperItem&&((helperItem.reportId>0&&helperItem.reportId!==reportMeta.reportId)||(helperItem.sourceRow>0&&helperItem.sourceRow!==row)))throw Object.assign(new Error('Sheet hỗ trợ GC không khớp dòng báo cáo.'),{code:'EXCEL_SYNC_ROW_IDENTITY_MISMATCH'});
    const snapshot=reportMeta.original.excel_readonly_cells;
    const cellValue=value=>value instanceof Date?value.toISOString():value==null?null:value;
    const changed=Array.isArray(snapshot)&&snapshot.some(item=>!Array.isArray(item)||!Number.isSafeInteger(item[0])||item[0]<1||item[0]>16384||!same(cellValue(sheet.getCell(row,item[0]).value),item[1]));
    if(changed&&reportMeta.machineLineId===null)throw Object.assign(new Error('Cột Excel không có ánh xạ cập nhật duy nhất đã bị sửa. Hãy sửa trên ứng dụng.'),{code:'EXCEL_SYNC_UNMAPPED_COLUMN_READ_ONLY'});
    if(reportMeta.machineLineId!==null){
      const helperChanged=!helperItem || helperItem.operationType!==normalizeOperationType(reportMeta.original.operation_type)
        || helperItem.operationMode!==normalizeOperationMode(reportMeta.original.operation_mode)
        || asText(helperItem.machine)!==asText(reportMeta.original.machine_no);
      if(changed||helperChanged)throw Object.assign(new Error('Dòng máy GC '+reportMeta.machineLineId+' chỉ để đối chiếu. Hãy sửa báo cáo máy trên ứng dụng.'),{code:'EXCEL_SYNC_MACHINE_LINE_READ_ONLY'});
      continue;
    }
    if (helperItem?.operationType) current.operationType = helperDisplayType(helperItem.operationType);
    if (helperItem?.operationMode) current.operationMode = helperDisplayMode(helperItem.operationMode);
    if (helperItem?.machine) current.machine = helperItem.machine;
    // Dùng cùng snapshot gốc cho mọi operation mode. Máy vẫn có các field tổng hợp
    // (SL OK, TG thực tế, NG, trừ giờ...) cần được phát hiện khi manager sửa Excel.
    const original = {
      work_date: rowDate.get(row) || null,
      shift: asText(reportMeta.original.shift),
      operation_type: normalizeOperationType(reportMeta.original.operation_type),
      operation_mode: normalizeOperationMode(reportMeta.original.operation_mode),
      machine_no: asText(reportMeta.original.machine_no) || null,
      product_name: asText(reportMeta.original.product_name) || null,
      training_percent: reportMeta.original.training_percent == null ? null : Number(reportMeta.original.training_percent),
      actual_time: asNumber(reportMeta.original.actual_time),
      tt_ok: asInteger(reportMeta.original.tt_ok),
      note: asText(reportMeta.original.note),
      deductions: normalizeDetailList(reportMeta.original.deductions, 'deduction_type_id', 'hours', false),
      defects: normalizeDetailList(reportMeta.original.defects, 'defect_type_id', 'quantity', true)
    };
    if (gcHelper) {
      helperDirty = upsertGcHelperRow(gcHelper, { sourceRow: row, reportId: id, workerCode: asText(current.workerCode), shift: asText(current.shift || original.shift), product: asText(current.product || original.product_name), operationType: normalizeOperationType(current.operationType) || normalizeOperationType(original.operation_type), operationMode: normalizeOperationMode(current.operationMode) || normalizeOperationMode(original.operation_mode), machine: asText(current.machine || original.machine_no) || null }) || helperDirty;
    }
    const candidate = normalizeEditable(current, meta.config.columns, normalizeOperationMode(current.operationMode) || reportMeta.operationMode, original);

    const preview = [];
    const changedPatch = {};
    const labels = {
      work_date: 'Ngày báo cáo', shift: 'Ca', operation_type: 'Loại thao tác', operation_mode: 'Chế độ', machine_no: 'Máy', product_name: 'Sản phẩm', training_percent: '% học việc',
      actual_time: 'TG thực tế', tt_ok: 'SL OK', note: 'Ghi chú', deductions: 'Trừ giờ', defects: 'NG chi tiết'
    };
    // A paper template exposes only a subset of fields. Never turn an
    // absent column into an empty/zero update to previously approved data.
    const available = new Set(meta.config.columns.map(col => col.key));
    const availablePatch = new Set([
      'work_date',
      ...(available.has('shift') ? ['shift'] : []),
      ...(available.has('operationType') || helperItem?.operationType ? ['operation_type'] : []),
      ...(available.has('operationMode') || helperItem?.operationMode ? ['operation_mode'] : []),
      ...(available.has('machine') || gcHelper ? ['machine_no'] : []),
      ...(available.has('product') ? ['product_name'] : []),
      ...(available.has('training') ? ['training_percent'] : []),
      ...(available.has('actualTime') ? ['actual_time'] : []),
      ...(available.has('ok') ? ['tt_ok'] : []),
      ...(available.has('note') ? ['note'] : []),
      ...(meta.config.columns.some(col => col.key.startsWith('deduction:') && col.typeId) ? ['deductions'] : []),
      ...(meta.config.columns.some(col => col.key.startsWith('defect:') && col.typeId) ? ['defects'] : [])
    ]);
    for (const [key, afterRaw] of Object.entries(candidate)) {
      if (!isExcelMutableField(key) || !availablePatch.has(key)) continue;
      const beforeRaw = reportMeta.original.excel_baseline && Object.prototype.hasOwnProperty.call(reportMeta.original.excel_baseline,key) ? reportMeta.original.excel_baseline[key] : original[key];
      const before = fieldValue(key, beforeRaw);
      const after = fieldValue(key, afterRaw);
      if (!same(before, after)) {
        changedPatch[key] = afterRaw;
        preview.push({ field: key, label: labels[key] || key, before, after });
      }
    }

    // Never send a report merely because object key order / enriched metadata differs.
    // A report is editable only when at least one concrete field has a real before -> after diff.
    if (!preview.length) continue;
    if(!reportMeta.expectedUpdatedAt||!Number.isFinite(Date.parse(reportMeta.expectedUpdatedAt)))throw Object.assign(new Error('Báo cáo thiếu phiên bản gốc. Hãy xuất Excel lại.'),{code:'EXCEL_SYNC_EXPECTED_VERSION_REQUIRED'});
    if(Object.prototype.hasOwnProperty.call(changedPatch,'training_percent'))throw Object.assign(new Error('Không được thay đổi % học việc lịch sử trong Excel.'),{code:'EXCEL_SYNC_TRAINING_READ_ONLY'});
    if(reportMeta.operationMode==='MACHINE'&&Object.keys(changedPatch).some(key=>key!=='note'))throw Object.assign(new Error('Số liệu máy đã duyệt phải sửa trên ứng dụng.'),{code:'EXCEL_SYNC_MACHINE_LINE_READ_ONLY'});

    changes.push({
      id,
      expected_updated_at: reportMeta.expectedUpdatedAt,
      patch: changedPatch,
      preview,
      source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode }
    });
  }
  // Blank ID + real worker/product data means a manager intentionally added a new Excel row.
  // It is sent as CREATE and the backend remains authoritative for validation/calculation.
  const knownIds = new Set(meta.reports.keys());
  for (let row = firstRow; row <= sheet.rowCount; row += 1) {
    // Chỉ coi dòng có STT số nguyên dương là dòng báo cáo mới.
    // Điều này loại bỏ dòng ngày, dòng TỔNG CỘNG và các dòng công thức/trang trí.
    const stt = Number(sheet.getCell(row, 1).value);
    if (!Number.isInteger(stt) || stt <= 0) continue;
    if (paperRows && knownPaperRows.has(row)) continue;
    const id = idColumn ? Number(sheet.getCell(row, idColumn.index).value) : 0;
    if (Number.isInteger(id) && id > 0) {
      if(explicitIdentity&&!knownIds.has(id))throw Object.assign(new Error('ID Excel không tồn tại trong metadata.'),{code:'EXCEL_SYNC_UNKNOWN_ID'});
      continue;
    }
    const current = currentByKey(sheet, row, meta.config.columns);
    if (paperRows && (asText(current.workerCode) || asText(current.product) || asText(current.shift))) {
      const error = new Error('Dòng mới trong mẫu giấy chưa có ID đồng bộ. Hãy thêm báo cáo qua ứng dụng rồi xuất Excel lại.');
      error.code = 'EXCEL_SYNC_UNTRACKED_PAPER_ROW';
      throw error;
    }
    if (paperRows) continue;
    const workerCode = asText(current.workerCode);
    const productName = asText(current.product);
    const shift = asText(current.shift);
    if (!workerCode && !productName && !shift) continue;
    if(meta.config.allowCreate===false)throw Object.assign(new Error('Mẫu này chỉ hỗ trợ sửa báo cáo đã có. Hãy thêm báo cáo trên ứng dụng.'),{code:'EXCEL_SYNC_CREATE_UNSUPPORTED'});
    if (!workerCode || !productName || !shift) {
      changes.push({
        create: true, id: null, row,
        invalid: true,
        error: 'Dòng mới phải có Mã NV, Ca và Mã SP.',
        preview: [],
        source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row }
      });
      continue;
    }
    const helperItem = gcHelper ? gcHelper.bySourceRow.get(row) : null;
    const operationMode = normalizeOperationMode(helperItem?.operationMode || current.operationMode) || null;
    const operationType = normalizeOperationType(helperItem?.operationType || current.operationType);
    const selectedMachine = asText(helperItem?.machine || current.machine) || null;
    if (meta.config.processCode === 'GC') {
      const missing = gcMissingFields(operationType, operationMode, selectedMachine);
      if (gcHelper) helperDirty = upsertGcHelperRow(gcHelper, { sourceRow: row, reportId: 0, workerCode, shift, product: productName, operationType, operationMode, machine: selectedMachine }) || helperDirty;
      if (missing.length) {
        changes.push({ create: true, id: null, row, invalid: true, error: `Dòng mới CẮT/LỒNG thiếu: ${missing.join(', ')}. Hãy bổ sung trong sheet ${GC_HELPER_SHEET}.`, preview: [
          { field: 'worker_code', label: 'Mã NV', before: null, after: workerCode },
          { field: 'product_name', label: 'Sản phẩm', before: null, after: productName }
        ], source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row } });
        continue;
      }
    }
    const deductions = mergeEditableDetails(current, meta.config.columns, 'deduction:', [], 'deduction_type_id', 'hours', false);
    const defects = mergeEditableDetails(current, meta.config.columns, 'defect:', [], 'defect_type_id', 'quantity', true);
    // An absent training cell is different from an explicit 0% learning rate.
    // The backend snapshots the worker's current training rate when absent.
    const trainingCell = current.training && typeof current.training === 'object'
      && current.training.result !== undefined ? current.training.result : current.training;
    const hasTrainingCell = trainingCell !== null && trainingCell !== undefined
      && asText(trainingCell) !== '';
    const trainingRaw = hasTrainingCell ? Number(trainingCell) : null;
    if (hasTrainingCell && (!Number.isFinite(trainingRaw) || trainingRaw < 0 || trainingRaw > 100)) {
      changes.push({
        create: true, id: null, row, invalid: true,
        error: '% học việc phải là số từ 0 đến 100.',
        source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row }
      });
      continue;
    }
    const extraData = {};
    for (const col of meta.config.columns.filter((col) => col.key.startsWith('extra:'))) {
      const key = col.key.slice('extra:'.length);
      const value = current[col.key];
      if (value !== null && value !== undefined && asText(value) !== '') extraData[key] = value instanceof Date ? excelDateToIso(value) : value;
    }
    const createData = {
      worker_code: workerCode,
      process_code: meta.config.processCode,
      work_date: rowDate.get(row) || null,
      shift,
      operation_type: operationType,
      operation_mode: operationMode,
      machine_no: selectedMachine,
      product_name: productName,
      training_percent: trainingRaw === null ? null : (trainingRaw >= 0 && trainingRaw <= 1 ? trainingRaw * 100 : trainingRaw),
      actual_time: asNumber(current.actualTime),
      tt_ok: asInteger(current.ok),
      note: asText(current.note),
      deductions,
      defects,
      extra_data: extraData
    };
    changes.push({
      create: true,
      id: null,
      row,
      data: createData,
      preview: [
        { field: 'worker_code', label: 'Mã NV', before: null, after: workerCode },
        { field: 'work_date', label: 'Ngày báo cáo', before: null, after: createData.work_date },
        { field: 'shift', label: 'Ca', before: null, after: shift },
        { field: 'operation_type', label: 'Loại thao tác', before: null, after: operationType },
        { field: 'operation_mode', label: 'Chế độ', before: null, after: operationMode },
        { field: 'machine_no', label: 'Máy', before: null, after: createData.machine_no },
        { field: 'product_name', label: 'Sản phẩm', before: null, after: productName },
        { field: 'actual_time', label: 'TG thực tế', before: null, after: createData.actual_time },
        { field: 'tt_ok', label: 'SL OK', before: null, after: createData.tt_ok }
      ].filter((item) => item.after !== null && item.after !== ''),
      source: { file: path.basename(filePath), sheet: meta.config.sheetName, process_code: meta.config.processCode, row }
    });
  }

  // Reading/previewing a workbook must never save it. Saving the in-memory GC
  // helper here could silently overwrite Excel/WPS edits made during parsing.
  // It is still used in memory to interpret this snapshot of the workbook.
  return {
    managed: true, changes, generatedAt: meta.config.generatedAt,
    yearMonth: meta.config.yearMonth || null,
    helperUpdated: false, helperUpdatePending: Boolean(helperDirty),
    helperUpdateError: null
  };
}

module.exports = {
  readExcelChanges,
  _private: {
    parseMeta,
    normalizeEditable,
    comparable,
    stableValue,
    same,
    normalizeDetailList,
    mergeEditableDetails,
    fieldValue,
    normalizeOperationMode,
    normalizeOperationType,
    excelDateToIso,
    parseGcHelperSheet, gcMissingFields, upsertGcHelperRow
  }
};
