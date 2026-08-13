const crypto = require('crypto');

function cleanText(value, { upper = false } = {}) {
  const text = String(value ?? '').trim();
  return upper ? text.toUpperCase() : text;
}

function normalizeDate(value) {
  const text = cleanText(value);
  return text ? text.slice(0, 10) : '';
}

function normalizeMode(value, hasMachineLines = false) {
  const raw = cleanText(value, { upper: true });
  if (hasMachineLines || ['MÁY', 'MAY', 'MACHINE'].includes(raw)) return 'MACHINE';
  if (['TAY', 'MANUAL', 'THỦ CÔNG', 'THU CONG'].includes(raw)) return 'MANUAL';
  return raw || 'MANUAL';
}

function normalizeMachineProductPairs({ machineLines = [], machineNo = null, productName = null, operationMode = null } = {}) {
  const lines = Array.isArray(machineLines) ? machineLines : [];
  const pairs = lines
    .map((line) => ({
      machine: cleanText(line?.machine_code ?? line?.machine_no, { upper: true }),
      product: cleanText(line?.product_code ?? line?.product_name),
    }))
    .filter((pair) => pair.machine || pair.product);

  if (pairs.length) {
    return pairs
      .map((pair) => `${pair.machine}\u001f${pair.product}`)
      .sort((a, b) => a.localeCompare(b, 'en'));
  }

  const mode = normalizeMode(operationMode, false);
  if (mode === 'MANUAL') return [`<MANUAL>\u001f${cleanText(productName)}`];
  return [`${cleanText(machineNo, { upper: true })}\u001f${cleanText(productName)}`];
}

function buildCanonicalLogicalDuplicateIdentity(input = {}) {
  const workerId = Number(input.workerId ?? input.worker_id);
  const processId = Number(input.processId ?? input.process_id);
  if (!Number.isInteger(workerId) || workerId <= 0) throw new Error('worker_id is required for logical duplicate identity');
  if (!Number.isInteger(processId) || processId <= 0) throw new Error('process_id is required for logical duplicate identity');

  const pairs = normalizeMachineProductPairs({
    machineLines: input.machineLines ?? input.machine_lines,
    machineNo: input.machineNo ?? input.machine_no,
    productName: input.productName ?? input.product_name,
    operationMode: input.operationMode ?? input.operation_mode,
  });
  const mode = normalizeMode(input.operationMode ?? input.operation_mode, Array.isArray(input.machineLines ?? input.machine_lines) && (input.machineLines ?? input.machine_lines).length > 0);

  return [
    `w=${workerId}`,
    `p=${processId}`,
    `d=${normalizeDate(input.workDate ?? input.work_date)}`,
    `s=${cleanText(input.shift, { upper: true })}`,
    `m=${mode}`,
    `pairs=${pairs.join('\u001e')}`,
  ].join('|');
}

function buildLogicalDuplicateKey(input = {}) {
  return crypto.createHash('sha256').update(buildCanonicalLogicalDuplicateIdentity(input), 'utf8').digest('hex');
}

module.exports = {
  buildCanonicalLogicalDuplicateIdentity,
  buildLogicalDuplicateKey,
  normalizeMachineProductPairs,
};
