'use strict';
const { asText, NUMBER_FORMATS } = require('./monthlyWorkbookValues.cjs');
const { PROCESS_TEMPLATE_SCHEMAS } = require('./monthlyWorkbookSchemas.cjs');
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { applyCellStyle, solidFill, thinBorder } = require('./monthlyWorkbookCellStyles.cjs');

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

  // Mỗi công đoạn có cấu trúc xuất riêng, đối chiếu theo các file báo cáo
  // thực tế tháng 10/2026 và các trường trong processFormSchemas.ts.
  // Các cột đối soát không có trong form giấy vẫn được giữ ở cuối bảng.
  const layouts = {
    GC: {
      fields: ['stt','workerCode','workerName','shift','machine','product','operationType','operationMode','training','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { machine: 'Số máy Cắt/Lồng', product: 'Mã SP', output: 'KQSX', outputPerHour: 'SL/H', achievement: '% thực tích' }
    },
    MAI: {
      fields: ['stt','workerCode','workerName','shift','machine','training','workingTime','actualTime','deductionTime','@deduction','product','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','@defect','ngRate'],
      headers: { workerName: 'Người mài', machine: 'Số máy mài', workingTime: 'Thời gian làm việc', actualTime: 'Thời gian mài thực tế', output: 'KQSX Mài', outputPerHour: 'SL/H Mài', ng: 'TỔNG PP', achievement: '% thực tích' }
    },
    DO: {
      fields: ['stt','workerCode','workerName','shift','machine','training','workingTime','actualTime','deductionTime','@deduction','product','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { workerName: 'Người đo', machine: 'Máy đo', workingTime: 'Thời gian đo', actualTime: 'Thời gian đo thực tế', output: 'KQSX Đo', outputPerHour: 'SL/H Đo', ng: 'Tổng lỗi Đo', achievement: '% thực tích' }
    },
    K1: {
      fields: ['stt','workerCode','workerName','shift','product','machine','extra:press_date','extra:press_box_shift','extra:deduction_work','extra:late_early_hours','extra:xlbv_deduction_worker','training','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'MÃ SẢN PHẨM', machine: 'Máy/vị trí Kiểm 1', output: 'TT Kiểm 1', outputPerHour: 'NS/H Kiểm 1', achievement: '% năng suất', ng: 'Tổng NG Kiểm 1' }
    },
    K2: {
      fields: ['stt','workerCode','workerName','shift','training','deductionTime','@deduction','workingTime','actualTime','product','machine','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'Mã SP Kiểm 2', machine: 'Máy/vị trí Kiểm 2', output: 'TT Kiểm 2', outputPerHour: 'Năng suất/giờ', achievement: '% năng suất', ng: 'Tổng NG Kiểm 2' }
    },
    CAN: {
      fields: ['stt','workerCode','workerName','shift','machine','extra:material_code','product','extra:rolling_hours','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ngRate','ng','@defect','ok','extra:stop_reason'],
      headers: { machine: 'Số máy cán', product: 'Mã SP Cán', standard: 'Định mức (kg/h)', enteredOutput: 'Thực tích nhập (kg)', output: 'Thực tích cán (kg)', outputPerHour: 'KG/H', achievement: '% thực tích', ng: 'Tổng lỗi Cán' },
      decimalFields: ['enteredOutput','output','ok','ng']
    },
    EP: {
      fields: ['stt','workerCode','workerName','shift','machine','product','extra:press_box_shift','extra:handler','workingTime','actualTime','deductionTime','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect','@deduction'],
      headers: { machine: 'Số máy Ép', product: 'Mã SP Ép', workingTime: 'Tổng thời gian Ép', actualTime: 'Thời gian Ép thực tế', output: 'KQSX Ép', outputPerHour: 'NS/H Ép', achievement: '% năng suất', ng: 'TỔNG PP Ép' }
    },
    XLBV: {
      fields: ['stt','workerCode','workerName','shift','product','machine','workingTime','actualTime','extra:stop_operation_hours','extra:deduction_work','extra:shortage_hours','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@defect'],
      headers: { product: 'Mã SP XLBV', machine: 'Vị trí XLBV', output: 'Thực tích XLBV', outputPerHour: 'SLSP/H', achievement: '% thực tích', ng: 'Tổng NG XLBV' }
    },
    SX3: {
      fields: ['stt','workerCode','workerName','shift','machine','product','extra:work_minutes','extra:assembly_minutes','extra:tray_minutes','extra:plan_quantity','workingTime','actualTime','deductionTime','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','ngRate','@deduction','@defect'],
      headers: { machine: 'Dây chuyền SX3', product: 'Mã SP lắp ráp', output: 'Thực tích lắp ráp', ng: 'Tổng NG Part', outputPerHour: 'SL/H Lắp ráp', achievement: '% kế hoạch' }
    },
    CVK: {
      fields: ['stt','workerCode','workerName','shift','extra:work_type','product','machine','workingTime','actualTime','deductionTime','@deduction','standard','enteredOutput','output','achievement','outputPerHour','ok','ng','@defect'],
      headers: { product: 'Mã công việc/SP', output: 'Khối lượng CVK', outputPerHour: 'SL/H CVK' }
    }
  };
  const layout = layouts[String(processCode || '').toUpperCase()];
  if (!layout) throw new Error(`Thiếu định nghĩa form Excel cho công đoạn ${processCode}`);
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const ordered = [];
  const used = new Set();
  const append = (column) => {
    if (!column || used.has(column.key)) return;
    used.add(column.key);
    ordered.push({
      ...column,
      header: layout.headers?.[column.key] || column.header,
      format: layout.decimalFields?.includes(column.key) ? NUMBER_FORMATS.DECIMAL : column.format
    });
  };
  for (const key of layout.fields) {
    if (key === '@deduction') {
      columns.filter((column) => column.group === 'deduction').forEach(append);
    } else if (key === '@defect') {
      columns.filter((column) => column.group === 'defect').forEach(append);
    } else {
      if (!byKey.has(key)) throw new Error(`Form ${processCode} tham chiếu cột không tồn tại: ${key}`);
      append(byKey.get(key));
    }
  }
  // Giữ toàn bộ trường nghiệp vụ và metadata (ngày nhập, trạng thái, ID,...)
  // để không mất dữ liệu khi cấu trúc form thay đổi.
  columns.forEach(append);
  if (ordered.length !== columns.length) throw new Error(`Form ${processCode} làm thiếu cột dữ liệu`);
  return ordered;
}

function groupStyle(group) {
  // Rule tháng 07/2026: toàn bộ header dùng cùng một hệ xanh, không chia màu theo nhóm.
  if (group === 'general') return { fill: COLORS.blue, light: COLORS.white, label: 'THÔNG TIN CHUNG' };
  if (group === 'time') return { fill: COLORS.blue, light: COLORS.white, label: 'THỜI GIAN' };
  if (group === 'deduction') return { fill: COLORS.blue, light: COLORS.white, label: 'CHI TIẾT THỜI GIAN TRỪ' };
  if (group === 'result') return { fill: COLORS.blue, light: COLORS.white, label: 'KẾT QUẢ SẢN XUẤT' };
  if (group === 'defect') return { fill: COLORS.blue, light: COLORS.white, label: 'CHI TIẾT NG' };
  return { fill: COLORS.blue, light: COLORS.white, label: 'TỔNG HỢP' };
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

module.exports = { detailColumnWidth, makeColumns, groupStyle, setGroupHeader };
