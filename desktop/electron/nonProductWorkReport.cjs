'use strict';

// Normalize non-product work classifications used by Excel exports.
function parseNonProductExtraData(report) {
  let extraData = report?.extra_data;
  if (typeof extraData === 'string') {
    try { extraData = JSON.parse(extraData); } catch (_) { extraData = {}; }
  }
  return extraData && typeof extraData === 'object' && !Array.isArray(extraData) ? extraData : {};
}

function isNonProductWorkReport(report) {
  const processCode = String(report?.process_code || report?.processCode || '').trim().toUpperCase();
  const extraData = parseNonProductExtraData(report);
  const flag = extraData.non_product_work ?? report?.non_product_work;
  return processCode === 'CVK'
    || flag === true
    || flag === 1
    || String(flag ?? '').trim().toLowerCase() === 'true';
}

function normalizedWorkTypeLabel(report) {
  if (!isNonProductWorkReport(report)) return '';
  const extraData = parseNonProductExtraData(report);
  const raw = extraData.work_type ?? report?.work_type ?? extraData.workType ?? report?.workType;
  const code = String(raw ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const labels = { TAIPP: 'TPP', TPP: 'TPP', KTCD: 'KTCD', XUATNHAP: 'XN', XN: 'XN' };
  return labels[code] || '';
}

module.exports = { parseNonProductExtraData, isNonProductWorkReport, normalizedWorkTypeLabel };
