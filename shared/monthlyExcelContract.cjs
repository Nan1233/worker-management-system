'use strict';

// Shared monthly export contract. Preserve the current ten-file process order
// (nine production processes plus CVK) and template families.
const PROCESS_EXPORTS=Object.freeze({
  CAN:Object.freeze({sheet:'CÁN',title:'CÁN',prefix:'01_CAN',templateKind:'workbook1-sheet'}),
  EP:Object.freeze({sheet:'ÉP',title:'ÉP',prefix:'02_EP',templateKind:'workbook1-sheet'}),
  XLBV:Object.freeze({sheet:'XỬ LÝ BAVIA',title:'XỬ LÝ BAVIA',prefix:'03_XU_LY_BAVIA',templateKind:'workbook1-sheet'}),
  GC:Object.freeze({sheet:'CẮT LỒNG',title:'CẮT/LỒNG',prefix:'04_CAT_LONG',templateKind:'workbook1-sheet'}),
  MAI:Object.freeze({sheet:'MÀI',title:'MÀI',prefix:'05_MAI',templateKind:'workbook1-sheet'}),
  DO:Object.freeze({sheet:'ĐO',title:'ĐO',prefix:'06_DO',templateKind:'workbook1-sheet'}),
  K1:Object.freeze({sheet:'KIỂM 1',title:'KIỂM 1',prefix:'07_KIEM_1',templateKind:'original-company'}),
  K2:Object.freeze({sheet:'KIỂM 2',title:'KIỂM 2',prefix:'08_KIEM_2',templateKind:'original-company'}),
  SX3:Object.freeze({sheet:'SẢN XUẤT 3',title:'SẢN XUẤT 3',prefix:'09_SAN_XUAT_3',templateKind:'worker-template'}),
  CVK:Object.freeze({sheet:'CÔNG VIỆC KHÁC',title:'CÔNG VIỆC KHÁC (CVK)',prefix:'10_CONG_VIEC_KHAC',templateKind:'worker-template'})
});
const PROCESS_CODES=Object.freeze(Object.keys(PROCESS_EXPORTS));
const PROCESS_FILE_PREFIXES=Object.freeze(Object.fromEntries(PROCESS_CODES.map(code=>[code,PROCESS_EXPORTS[code].prefix])));
const APPROVED_DATA_SOURCE='tidb.production_reports.approved';
const MONTHLY_FILE_COUNT=PROCESS_CODES.length+1;
function normalizeYearMonth(value){
  const month=String(value??'').trim().slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Tháng xuất Excel không hợp lệ: '+month);
  return month;
}
module.exports={PROCESS_EXPORTS,PROCESS_CODES,PROCESS_FILE_PREFIXES,APPROVED_DATA_SOURCE,MONTHLY_FILE_COUNT,normalizeYearMonth};
