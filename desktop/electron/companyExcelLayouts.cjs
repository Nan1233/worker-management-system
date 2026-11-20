'use strict';

// Immutable company workbook template / layout registry.
const GROUPS = Object.freeze({
  GIA_CONG: {
    code: 'GIA_CONG',
    title: 'Gia công',
    template: 'bao-cao-cat-long-export.xlsx',
    fileName: ({ month, year }) => `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`,
    // Các sheet khác chỉ được giữ để tra cứu/tính toán. Chỉ ghi dữ liệu vào Cắt lồng.
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }]
  },
  MAI_DO: {
    code: 'MAI_DO',
    title: 'Mài - Đo',
    template: 'bao-cao-mai-do-export.xlsx',
    fileName: ({ month, year }) => `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`,
    sheets: [
      { processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' },
      { processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }
    ]
  }
});

const LAYOUTS = Object.freeze({
  GIA_CONG: {
    headerSearchColumn: 31,
    headerPattern: /ngày\s*\/?\s*tháng/i,
    lastReportColumn: 54,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5,
      training: 6, totalTime: 7, actualTime: 8, changeCount: 9,
      deductionTotal: 10, product: 27, standardOutput: 28,
      actualOutput: 29, achievement: 30, workDate: 31,
      outputPerHour: 32, ok: 33, totalNg: 34, ngRate: 35
    },
    deductions: [11, 26],
    defects: [36, 53],
    deductionCodeColumns: {
      THIEU_SP: 11,
      BAT_MAY: 12,
      CHUYEN_MA: 13,
      CHINH_MAY: 14,
      CHO_CHINH_MAY: 15,
      MAT_DIEN: 16,
      MAT_KHI: 17,
      CHO_HANG: 18,
      BAO_DUONG: 19,
      NGHI_GIAI_LAO: 20,
      GIAO_CA: 21,
      HO_TRO: 22,
      GIAT_CAN_TUOT: 23,
      '5S': 24,
      HOC_VIEC: 25,
      DI_MUON_VE_SOM: 26
    },
    defectCodeColumns: {
      KQD: 36,
      VO_CAO_SU: 37,
      K_XUOC_CONG_GAY: 38,
      CAO_SU_XOAY: 39,
      CAT_KHONG_DUT: 40,
      BAVIA: 41,
      CSH: 42,
      PPCM: 43,
      KT_LON: 44,
      KT_NHO: 45,
      LCS: 46,
      CAT_LEM: 47,
      RACH_NVL: 48,
      CHAN_NGAN_DAI: 49,
      SOT_VIA: 50,
      FURE_TRUC: 51,
      LAN_CS: 52,
      BAVIA_CAT_HUT: 53,
      THIEU_CAO_SU: 54
    }
  },
  MAI: {
    blockStrategy: 'date-anchor',
    headerSearchColumn: 36,
    headerPattern: /ngày/i,
    blockStartOffset: 2,
    blockEndOffset: 1,
    lastReportColumn: 46,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      grindingSeconds: 6, training: 8, actualTime: 9, totalTime: 10, deductionTotal: 11,
      product: 32, standardOutput: 33, actualOutput: 34,
      achievement: 35, workDate: 36, outputPerHour: 37,
      ok: 38, totalNg: 39
    },
    deductions: [12, 31],
    defects: [40, 46]
  },
  DO: {
    headerSearchColumn: 32,
    headerPattern: /ngày/i,
    lastReportColumn: 49,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      relatedGrindingMachine: 6, training: 7, totalTime: 8, actualTime: 9, deductionTotal: 10,
      product: 28, standardOutput: 29, actualOutput: 30,
      achievement: 31, workDate: 32, outputPerHour: 33,
      ok: 34, totalNg: 35, ngRate: 36
    },
    deductions: [11, 27],
    defects: [37, 49]
  }
});


module.exports = { GROUPS, LAYOUTS };
