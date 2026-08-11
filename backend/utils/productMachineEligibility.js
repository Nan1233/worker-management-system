const normalize = (value) => String(value ?? '').trim().toUpperCase();

const parseProductMachineHint = (productCode) => {
  const match = normalize(productCode).match(/-(AUTO|AUTOMATIC|\d+)$/i);
  if (!match) return null;
  const suffix = normalize(match[1]);
  if (suffix === 'AUTO' || suffix === 'AUTOMATIC') return { kind: 'AUTO', value: 'AUTO' };
  return { kind: 'NUMBER', value: String(Number(suffix)) };
};

const validateEncodedGcMachineProduct = ({ processCode, productCode, machineCode, isAutomatic, operationMode }) => {
  if (normalize(processCode) !== 'GC') return null;
  const hint = parseProductMachineHint(productCode);
  const mode = normalize(operationMode);

  if (mode === 'MANUAL') {
    return hint ? 'Sản phẩm dành riêng cho máy không được dùng ở chế độ Tay' : null;
  }

  if (mode !== 'MACHINE' || !hint) return null;
  if (hint.kind === 'AUTO') {
    return Number(isAutomatic || 0) === 1 ? null : 'Sản phẩm -auto chỉ được dùng với máy tự động';
  }
  const normalizedMachine = normalize(machineCode);
  const selectedNumber = /^\d+$/.test(normalizedMachine) ? String(Number(normalizedMachine)) : null;
  if (Number(isAutomatic || 0) === 1 || selectedNumber !== hint.value) {
    return `Sản phẩm -${hint.value} chỉ được dùng với máy ${hint.value}`;
  }
  return null;
};

module.exports = { parseProductMachineHint, validateEncodedGcMachineProduct };
