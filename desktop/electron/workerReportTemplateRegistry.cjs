'use strict';

// Worker workbook process naming and defect/deduction catalogue aliases.
const TEMPLATE_NAME = 'Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx';
const PROCESS_CODES = Object.freeze(['CAN', 'EP', 'XLBV', 'GC', 'MAI', 'DO', 'K1', 'K2', 'SX3', 'CVK']);
const PROCESS_FILE_PREFIXES = Object.freeze({
  CAN: '01_CAN', EP: '02_EP', XLBV: '03_XU_LY_BAVIA', GC: '04_CAT_LONG',
  MAI: '05_MAI', DO: '06_DO', K1: '07_KIEM_1', K2: '08_KIEM_2', SX3: '09_SAN_XUAT_3', CVK: '10_CONG_VIEC_KHAC'
});


const DETAIL_ALIASES = Object.freeze({
  'kqd dap lai': 'kqd', 'kqd tuột': 'kqd', 'kqd dl': 'kqd',
  'vo do long': 'vo cao su', 'vo long': 'vo cao su', 'vcs': 'vo cao su',
  'xuoc do long': 'k xuoc cong gay', 'xuoc long': 'k xuoc cong gay',
  'cong gay': 'k xuoc cong gay', 'xoay': 'cao su xoay',
  'khong dut': 'cat khong dut', 'bavia hut': 'bavia',
  'cao su': 'lcs', 'loi cao su': 'lcs', 'ng kich thuoc': 'kt lon',
  'cat lem': 'cat lem', '5s': '5s', 'hoc viec dao tao': 'hoc viec',
  'di muon ve som': 'di muon ve som'
});

// DB detail name (as entered on the worker form) -> template column header.
// Several DB types may share one template column; their values are summed.
// Encoded GC form catalogue: CAT01-CAT10 (Cắt) and LONG01-LONG08 (Lồng).
// The GC export uses the same complete 18-column CAT/LONG catalogue as the
// data-entry form. normalizeGcDefectHeaders replaces the old 19-column block
// before mapping values, so encoded categories do not create duplicate NG columns.
const GC_FORM_DEFECT_COLUMN_BY_CODE = Object.freeze({
  CAT01: 'CAT01 - Cao su không đứt',
  CAT02: 'CAT02 - Cắt lẹm',
  CAT03: 'CAT03 - Cắt phạm',
  CAT04: 'CAT04 - Cao su ngắn',
  CAT05: 'CAT05 - Cao su dài',
  CAT06: 'CAT06 - Bavia cao su',
  CAT07: 'CAT07 - Phế phẩm chỉnh máy',
  CAT08: 'CAT08 - Lỗi cao su (NCC)',
  CAT09: 'CAT09 - Lẫn cao su',
  CAT10: 'CAT10 - Khác',
  LONG01: 'LONG01 - Không qua dưỡng',
  LONG02: 'LONG02 - Cao su vỡ',
  LONG03: 'LONG03 - Trục xước',
  LONG04: 'LONG04 - Trục gãy, cong',
  LONG05: 'LONG05 - Thiếu cao su',
  LONG06: 'LONG06 - Lẫn trục',
  LONG07: 'LONG07 - Lẫn cao su',
  LONG08: 'LONG08 - Khác'
});

const TEMPLATE_COLUMN_ALIASES = Object.freeze({
  // Trừ H (CAN/EP/XLBV/MAI/DO/K1/K2/SX3 catalogue -> worker template)
  'bat may, xet may, dau gio': 'bat may, xet may',
  'cho hang, het hang': 'cho hang',
  'bao duong': 'bao duong may',
  'ho tro': 'dung may di ho tro',
  '5s, do bui, xi bui, lay bui': '5s',
  'hoc viec': 'hoc viec, dao tao',
  // NG Gia công (LONG/CAT catalogue -> worker template)
  'khong qua duong': 'kqd',
  'cao su vo': 'vo cao su',
  'truc xuoc': 'k xuoc cong gay',
  'truc gay, cong': 'k xuoc cong gay',
  'thieu cao su': 'thieu cao su',
  'lan cao su': 'lan cs',
  'cao su khong dut': 'cat khong dut',
  'cao su ngan': 'chan ngan dai',
  'cao su dai': 'chan ngan dai',
  'bavia cao su': 'bavia',
  'phe pham chinh may': 'ppcm',
  'loi cao su ( ncc )': 'lcs',
  'loi cao su (ncc)': 'lcs',
  // NG other processes
  'rach nguyen vat lieu': 'rach nvl',
  'kich thuoc lon': 'kt lon',
  'kich thuoc nho': 'kt nho'
});


module.exports = { TEMPLATE_NAME, PROCESS_CODES, PROCESS_FILE_PREFIXES,
  DETAIL_ALIASES, GC_FORM_DEFECT_COLUMN_BY_CODE, TEMPLATE_COLUMN_ALIASES };
