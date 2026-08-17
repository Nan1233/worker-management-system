'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const TEMPLATE_CANDIDATES = [
  path.join(__dirname, '../templates/file mẫu.xlsx'),
  path.join(__dirname, '../templates/file m#U1eabu.xlsx'),
  path.join(__dirname, '../templates/file mß║½u.xlsx')
];

const PROCESS_TEMPLATE_CONTRACTS = Object.freeze({
  CAN:  { sheet: 'CÁN',       headerRow: 133, dataStartRow: 134, dataEndRow: 3323 },
  EP:   { sheet: 'EP',        headerRow: 173, dataStartRow: 174, dataEndRow: 3772 },
  XLBV: { sheet: 'XLBV',      headerRow: 333, dataStartRow: 334, dataEndRow: 3391 },
  GC:   { sheet: 'Cắt lồng',  headerRow: 326, dataStartRow: 327, dataEndRow: 515 },
  MAI:  { sheet: 'TT Mài',    headerRow: 338, dataStartRow: 339, dataEndRow: 468 },
  DO:   { sheet: 'TT Đo',     headerRow: 207, dataStartRow: 208, dataEndRow: 4607 },
  K1:   { sheet: 'TT Kiểm 1', headerRow: 208, dataStartRow: 209, dataEndRow: 329 },
  K2:   { sheet: 'TT Kiểm 2', headerRow: 246, dataStartRow: 247, dataEndRow: 396 },
  SX3:  { sheet: 'sx3',        headerRow: 3,   dataStartRow: 6,   dataEndRow: 9 }
});

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

async function resolveTemplatePath() {
  for (const file of TEMPLATE_CANDIDATES) {
    try {
      await fs.access(file);
      return file;
    } catch (_) {}
  }
  throw Object.assign(new Error('Không tìm thấy file mẫu Excel KTC trong backend/templates'), {
    code: 'KTC_EXCEL_TEMPLATE_MISSING',
    statusCode: 500
  });
}

function getProcessTemplateContract(processCode) {
  const code = String(processCode || '').trim().toUpperCase();
  const contract = PROCESS_TEMPLATE_CONTRACTS[code];
  if (!contract) {
    throw Object.assign(new Error(`Công đoạn ${code || '(trống)'} chưa có contract Excel mẫu`), {
      code: 'KTC_EXCEL_TEMPLATE_PROCESS_UNSUPPORTED',
      statusCode: 422
    });
  }
  return { processCode: code, ...contract };
}

module.exports = {
  TEMPLATE_CANDIDATES,
  PROCESS_TEMPLATE_CONTRACTS,
  normalizeLabel,
  resolveTemplatePath,
  getProcessTemplateContract
};
