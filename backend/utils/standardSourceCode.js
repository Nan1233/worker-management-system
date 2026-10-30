'use strict';

// Persist a stable, semantic source code compatible with production VARCHAR(20).
// Do not truncate source labels: truncation can make distinct resolution paths ambiguous.
function storedStandardSource(value) {
  const source = String(value || 'DEFAULT').trim().toUpperCase();
  const exact = {
    NON_PRODUCT_WORK: 'NON_PRODUCT_WORK',
    PRODUCT_VERSION_PROCESS_FALLBACK: 'PROD_VER_PROC_FBK',
    PRODUCT_VERSION_SNAPSHOT: 'PROD_VER_SNAPSHOT',
    LEGACY_PRODUCT_STANDARD_PROCESS_FALLBACK: 'LEGACY_PROC_FBK',
    LEGACY_PRODUCT_STANDARD: 'LEGACY_PRODUCT',
    PRODUCT_VERSION: 'PROD_VERSION',
    PRODUCT_VERSION_HISTORICAL: 'PROD_VER_HIST',
    MACHINE: 'MACHINE',
    MACHINE_HISTORICAL: 'MACHINE_HIST',
    DEFAULT: 'DEFAULT',
  };
  if (exact[source]) return exact[source];
  // Resolver may append a fallback marker to product/machine source names.
  const machineFallback = source.endsWith('_MACHINE_FALLBACK');
  const processFallback = source.endsWith('_PROCESS_FALLBACK');
  const base = machineFallback ? source.slice(0, -'_MACHINE_FALLBACK'.length)
    : processFallback ? source.slice(0, -'_PROCESS_FALLBACK'.length) : source;
  // Handle the machine-fallback legacy family before the exact base mapping:
  // LEGACY_PRODUCT + _MACH_FB would exceed VARCHAR(20), while LEGACY_MACH_FB fits.
  const baseCode = (machineFallback && base.startsWith('LEGACY_PRODUCT_STANDARD')) ? 'LEGACY'
    : exact[base] || (base.startsWith('PRODUCT_VERSION') ? 'PROD_VERSION'
      : base.startsWith('LEGACY_PRODUCT_STANDARD') ? 'LEGACY_PRODUCT'
      : base.startsWith('MACHINE') ? 'MACHINE' : null);
  if (baseCode) {
    const code = baseCode + (machineFallback ? '_MACH_FB' : processFallback ? '_PROC_FB' : '');
    if (code.length <= 20) return code;
  }
  if (source.length <= 20) return source;
  const error = new Error('Nguồn định mức vượt giới hạn lưu trữ và chưa có mã tương thích: ' + source);
  error.code = 'STANDARD_SOURCE_CODE_UNMAPPED';
  throw error;
}

module.exports = { storedStandardSource };
