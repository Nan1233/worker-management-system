'use strict';

// ExcelJS 4.4.0 can crash while reconciling a WPS workbook when a worksheet
// contains an orphaned legacy comments/VML relationship. The real GC template
// has that shape. Keep the template itself unchanged on disk; sanitize only the
// in-memory ZIP passed to ExcelJS, and only when it is the Cắt lồng template.
const Module = require('node:module');
const JSZip = require('jszip');

const originalLoad = Module._load;
let patched = false;

function log(event, data = {}) {
  try { console.log('[KTC-EXCEL-TEMPLATE-SANITIZE]', event, JSON.stringify(data)); } catch (_) {}
}

async function sanitizeIfGcTemplate(input) {
  if (!Buffer.isBuffer(input)) return input;
  const zip = await JSZip.loadAsync(input);
  const workbookXmlFile = zip.file('xl/workbook.xml');
  if (!workbookXmlFile) return input;
  const workbookXml = await workbookXmlFile.async('string');
  if (!workbookXml.includes('Cắt lồng')) return input;

  let removedParts = 0;
  let rewrittenRels = 0;
  let rewrittenSheets = 0;

  for (const name of Object.keys(zip.files)) {
    if (/^xl\/comments\d+\.xml$/i.test(name) || /^xl\/drawings\/vmlDrawing\d+\.vml$/i.test(name)) {
      zip.remove(name);
      removedParts += 1;
    }
  }

  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const next = xml.replace(/<Relationship\b[^>]*\bType="[^"]*(?:comments|vmlDrawing)[^"]*"[^>]*\/?>/gi, '');
    if (next !== xml) {
      zip.file(name, next);
      rewrittenRels += 1;
    }
  }

  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const next = xml.replace(/<legacyDrawing\b[^>]*\/?>/gi, '');
    if (next !== xml) {
      zip.file(name, next);
      rewrittenSheets += 1;
    }
  }

  if (!removedParts && !rewrittenRels && !rewrittenSheets) {
    log('NO_SANITIZE_NEEDED');
    return input;
  }

  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  log('SANITIZED', {
    removedParts,
    rewrittenRels,
    rewrittenSheets,
    bytesBefore: input.length,
    bytesAfter: output.length
  });
  return output;
}

function patchExcelJs(ExcelJS) {
  if (!ExcelJS?.Workbook || patched) return ExcelJS;
  const probe = new ExcelJS.Workbook();
  const xlsx = probe.xlsx;
  const proto = Object.getPrototypeOf(xlsx);
  if (!proto || typeof proto.load !== 'function') {
    log('PATCH_FAILED', { reason: 'xlsx.load prototype not found' });
    return ExcelJS;
  }

  const originalXlsxLoad = proto.load;
  proto.load = async function patchedXlsxLoad(data, options) {
    const safeData = await sanitizeIfGcTemplate(data);
    return originalXlsxLoad.call(this, safeData, options);
  };
  patched = true;
  log('PATCH_INSTALLED', { exceljs: '4.4.0' });
  return ExcelJS;
}

Module._load = function ktcExcelTemplateSanitize(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (request === 'exceljs') return patchExcelJs(loaded);
  return loaded;
};
