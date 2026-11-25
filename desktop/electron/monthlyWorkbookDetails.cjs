'use strict';
const { asText, asNumber, normalize } = require('./monthlyWorkbookValues.cjs');
const { PROCESS_TEMPLATE_SCHEMAS } = require('./monthlyWorkbookSchemas.cjs');

// Alias-aware production detail mapping. Machine deductions stay on machine lines.
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

function parseDetailArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

// GC MACHINE parent-level deductions are intentionally empty. The Worker
// deduction credit lives on each machine line, so read those line snapshots
// without borrowing shared physical-event deductions.
function reportDetailItems(report, processCode, kind) {
  const reportKey = kind === 'deduction' ? 'deductions' : 'defects';
  const reportItems = Array.isArray(report?.[reportKey]) ? report[reportKey] : [];
  const isGcMachine = normalize(processCode) === 'GC'
    && normalize(report?.operation_mode) === 'MACHINE';
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : Array.isArray(report?.machine_lines) ? report.machine_lines : [];
  if (!isGcMachine || !lines.length) return reportItems;

  const lineItems = lines.flatMap((line) => {
    const direct = parseDetailArray(line?.[reportKey] ?? line?.[kind]);
    if (direct.length) return direct;
    return parseDetailArray(line?.[kind === 'deduction' ? 'deductions_json' : 'defects_json']);
  });

  if (lineItems.length) return lineItems;
  return lines.length === 1 ? reportItems : [];
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
    for (const item of reportDetailItems(report, processCode, kind)) append(item);
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


module.exports = {
  detailId, detailCode, detailLabel, detailKey, parseDetailArray, reportDetailItems,
  detailAliases, labelQuality, processDetailTypes, detailValue, detailMap,
};
