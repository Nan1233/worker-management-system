'use strict';

// Excel helpers built on the production exporter, not on a copy of it.
//
// GC rows are rendered by backend/services/gcWorkerReportExcel.js into
// backend/templates/04_CAT_LONG_template.xlsx (the GC source of truth); these
// helpers only load, locate and read back cells.

const path = require('node:path');
const config = require('./config.cjs');

const BACKEND = path.join(config.ROOT, 'backend');
const ExcelJS = require(path.join(BACKEND, 'node_modules', 'exceljs'));
const { writeGcWorkerSheet } = require(path.join(BACKEND, 'services', 'gcWorkerReportExcel.js'));
const { LAYOUTS } = require(path.join(BACKEND, 'config', 'excelLayouts.js'));

const GC_TEMPLATE = path.join(BACKEND, 'templates', '04_CAT_LONG_template.xlsx');
const GC_SHEET = 'Báo cáo công nhân';
const GC_LAYOUT = LAYOUTS.GIA_CONG_04;

function columnLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - m) / 26); }
  return s;
}

function columnNumber(letters) {
  return String(letters).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** Inclusive list of column numbers between two letters, e.g. range('H','W'). */
function range(from, to) {
  const out = [];
  for (let c = columnNumber(from); c <= columnNumber(to); c += 1) out.push(c);
  return out;
}

async function loadWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  return workbook;
}

async function loadBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

const cellText = (value) => {
  if (value == null) return '';
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((p) => p.text).join('');
  return String(value);
};

/** Header label (row 3) of every column of the GC sheet, keyed by column number. */
function headerMap(sheet, row = GC_LAYOUT.labelRow) {
  const map = new Map();
  for (let c = 1; c <= GC_LAYOUT.lastColumn; c += 1) map.set(c, cellText(sheet.getRow(row).getCell(c).value).trim());
  return map;
}

/** Render reports into a fresh copy of the GC template with the real exporter. */
async function renderGc(reports, options = {}) {
  const workbook = await loadWorkbook(GC_TEMPLATE);
  const sheet = workbook.getWorksheet(GC_SHEET);
  const result = writeGcWorkerSheet(sheet, reports, options);
  return { workbook, sheet, result };
}

/** Write a workbook to the layer's artifact folder and load it back (round trip). */
async function saveAndReload(workbook, layer, name) {
  const file = path.join(config.layerDir(layer), name);
  await workbook.xlsx.writeFile(file);
  return { file, workbook: await loadWorkbook(file) };
}

const value = (sheet, ref) => sheet.getCell(ref).value;

/** Non-empty numeric cells of a row within a column list, as { letter: value }. */
function filledCells(sheet, rowNumber, columns) {
  const out = {};
  for (const c of columns) {
    const v = sheet.getRow(rowNumber).getCell(c).value;
    if (v !== null && v !== undefined && v !== '') out[columnLetter(c)] = v;
  }
  return out;
}

module.exports = {
  ExcelJS,
  GC_TEMPLATE,
  GC_SHEET,
  GC_LAYOUT,
  columnLetter,
  columnNumber,
  range,
  loadWorkbook,
  loadBuffer,
  headerMap,
  renderGc,
  saveAndReload,
  value,
  filledCells,
  cellText
};
