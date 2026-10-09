'use strict';

// Column layouts of the company Excel workbooks (structure only, from the sample files).
const LAYOUTS = Object.freeze({
  GIA_CONG: {
    headerSearchColumn: 31, // AE - Ngày/Tháng
    headerPattern: /ngày\s*\/?\s*tháng/i,
    labelRow: 3,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5,
      training: 6, totalTime: 7, actualTime: 8, deductionTotal: 10,
      product: 27, plannedOutput: 28, actualOutput: 29, achievement: 30,
      workDate: 31, outputPerHour: 32, ok: 33, totalNg: 34, ngRate: 35
    },
    deductions: [11, 26],
    defects: [36, 54] // AJ..BB: 19 defect columns (BB = thiếu cao su)
  },
  // Flat "Báo cáo công nhân" sheet of 04_CAT_LONG_09-2026 (source of truth for the
  // Gia công output): one row per machine line / manual report, date rows between
  // days, 48 columns A:AV, header on row 3. Only AA is a formula (IFERROR(Z/Y,0)).
  GIA_CONG_04: {
    labelRow: 3,
    dataStyleRow: 5,
    dateStyleRow: 4,
    lastColumn: 49,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5,
      totalHours: 6, workedHours: 7, deductionTotal: 8,
      product: 25, standard: 26, tt: 27, achievement: 28, ok: 29, totalNg: 30
    },
    deductions: [9, 24],  // I..X: Thiếu sản lượng + 15 loại trừ giờ
    defects: [31, 49]     // AE..AW: 19 loại NG (KQD .. thiếu cao su)
  },
  MAI: {
    headerSearchColumn: 36, // AJ - ngày
    headerPattern: /ngày/i,
    labelRow: 2,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 8, totalTime: 10, actualTime: 9, deductionTotal: 11,
      product: 32, plannedOutput: 33, actualOutput: 34, achievement: 35,
      workDate: 36, outputPerHour: 37, ok: 38, totalNg: 39
    },
    deductions: [12, 31],
    defects: [40, 46]
  },
  DO: {
    headerSearchColumn: 32, // AF - ngày
    headerPattern: /ngày/i,
    labelRow: 2,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 7, totalTime: 8, actualTime: 9, deductionTotal: 10,
      product: 28, plannedOutput: 29, actualOutput: 30, achievement: 31,
      workDate: 32, outputPerHour: 33, ok: 34, totalNg: 35, ngRate: 36
    },
    deductions: [11, 27],
    defects: [37, 49]
  },
  // TT Kiểm (AB KIỂM THÁNG 09-2026). Declared for the shared engine; there is no
  // bundled company template for Kiểm yet, so no export group points at it.
  KIEM: {
    headerSearchColumn: 28, // AB - Ngày/ Tháng
    headerPattern: /ngày\s*\/?\s*tháng/i,
    labelRow: 2,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3,
      training: 4, deductionTotal: 5,
      totalTime: 22, actualTime: 23,
      product: 24, plannedOutput: 25, actualOutput: 26, achievement: 27,
      workDate: 28, outputPerHour: 29, ok: 30, totalNg: 31, ngRate: 32
    },
    deductions: [6, 20],  // F..T: 15 deduction columns
    defects: [33, 86]     // AG..CH: 53 defect columns + KQD
  }
});

module.exports = { LAYOUTS };
