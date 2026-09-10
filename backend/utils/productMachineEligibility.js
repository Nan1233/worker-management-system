const normalize = (value) => String(value ?? '').trim().toUpperCase();

const normalizeMachineKey = (value) => {
  const code = normalize(value).replace(/\s+/g, '');
  if (!code) return '';
  const numeric = code.match(/^(?:MÁY|MAY|MACHINE|M|C)[-_]?(\d{1,2})$/i) || code.match(/^(\d{1,2})$/);
  return numeric ? String(Number(numeric[1])) : code;
};

const parseProductMachineHint = (productCode) => {
  const match = normalize(productCode).match(/-(AUTO|AUTOMATIC|\d+)$/i);
  if (!match) return null;
  const suffix = normalize(match[1]);
  if (suffix === 'AUTO' || suffix === 'AUTOMATIC') return { kind: 'AUTO', value: 'AUTO' };
  return { kind: 'NUMBER', value: String(Number(suffix)) };
};

// KTC GC automatic machines are C5/C6/C7/C11. Keep this rule identical to
// the worker UI instead of relying only on a potentially stale DB flag.
const GC_AUTOMATIC_MACHINE_CODES = new Set(['5', '6', '7', '11']);
const isGcAutomaticMachine = (machineCode) =>
  GC_AUTOMATIC_MACHINE_CODES.has(normalizeMachineKey(machineCode));

const validateEncodedGcMachineProduct = ({ processCode, productCode, machineCode, isAutomatic, operationMode }) => {
  if (normalize(processCode) !== 'GC') return null;
  const hint = parseProductMachineHint(productCode);
  const mode = normalize(operationMode);

  if (mode === 'MANUAL') {
    return hint ? 'Sản phẩm dành riêng cho máy không được dùng ở chế độ Tay' : null;
  }

  if (mode !== 'MACHINE' || !hint) return null;

  const automatic = isGcAutomaticMachine(machineCode) || Number(isAutomatic || 0) === 1;
  if (hint.kind === 'AUTO') {
    return automatic ? null : 'Sản phẩm -auto chỉ được dùng với máy tự động';
  }

  const normalizedMachine = normalizeMachineKey(machineCode);
  const selectedNumber = /^\d+$/.test(normalizedMachine) ? String(Number(normalizedMachine)) : null;
  if (automatic || selectedNumber !== hint.value) {
    return `Sản phẩm -${hint.value} chỉ được dùng với máy ${hint.value}`;
  }
  return null;
};

module.exports = { parseProductMachineHint, validateEncodedGcMachineProduct, normalizeMachineKey, isGcAutomaticMachine };
