'use strict';

// Structure taken from the company sample workbooks (AB GIA CÔNG / MÀI - ĐO /
// KIỂM 09-2026 and 04_CAT_LONG_09-2026). Only column LABELS live here, never
// sample data; report values always come from the database.

// Labels the template copy in backend/templates may have lost. Used only to fill
// blank header cells of a layout range, starting at `start`.
const LAYOUT_EXPECTED_LABELS = Object.freeze({
  // 'Cắt lồng' AJ..BB. The bundled template has blank headers at AX, AY, BA, BB.
  GIA_CONG: Object.freeze({
    defects: Object.freeze({
      start: 36,
      labels: Object.freeze([
        'KQD', 'Vỡ cao su', 'K xước cong gãy', 'Cao su xoay', 'Cắt không đứt', 'bavia', 'CSH', 'ppcm',
        'KT lớn', 'KT nhỏ', 'LCS', 'cắt lẹm', 'rách nvl', 'Chân ngắn dài', 'sót via', 'fure trục',
        'lẫn cs', 'bavia cắt hụt', 'thiếu cao su'
      ])
    })
  })
});

// DB defect name -> company sheet header, ONLY where the repo already encodes the
// same equivalence (backend/utils/reportDetailNormalizer.js LEGACY_DEFECT_FIELDS /
// CANONICAL_GC_DEFECTS, and the legacy form labels). Anything else is reported as
// unmapped instead of being placed under a guessed column.
const GIA_CONG_DEFECT_ALIASES = Object.freeze({
  'Cao su không đứt': 'Cắt không đứt', // legacy field khong_dut
  'Cao su vỡ': 'Vỡ cao su',            // legacy field vo_do_long
  'Trục xước': 'K xước cong gãy',      // legacy field xuoc_do_long
  'Trục gãy, cong': 'K xước cong gãy', // legacy field cong_gay
  'Bavia cao su': 'bavia',             // legacy field bavia_hut
  'Lỗi cao su ( NCC )': 'LCS'          // legacy field loi_cao_su
});

// The flat 04_CAT_LONG layout has the same 19 defect headers as 'Cắt lồng'.
const DEFECT_NAME_ALIASES = Object.freeze({
  GIA_CONG: GIA_CONG_DEFECT_ALIASES,
  GIA_CONG_04: GIA_CONG_DEFECT_ALIASES
});

module.exports = { LAYOUT_EXPECTED_LABELS, DEFECT_NAME_ALIASES };
