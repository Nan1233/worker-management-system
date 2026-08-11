const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..','electron');
const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
const preload=fs.readFileSync(path.join(root,'preload.cjs'),'utf8');
const workbook=fs.readFileSync(path.join(root,'monthlyWorkbookLocal.cjs'),'utf8');
const sync=fs.readFileSync(path.join(root,'excelDbSync.cjs'),'utf8');
if(!/_KTC_SYNC/.test(workbook)) throw new Error('Thiếu metadata sheet _KTC_SYNC');
if(!/veryHidden/.test(workbook)) throw new Error('_KTC_SYNC phải veryHidden');
if(!/production\/excel-sync/.test(main)) throw new Error('Desktop chưa gọi API Excel->DB');
if(!/REPORT_VERSION_CONFLICT|expected_updated_at/.test(sync)) throw new Error('Thiếu optimistic concurrency metadata');
if(!/ktc-preview-excel-db-sync/.test(main) || !/ktc-apply-excel-db-sync/.test(main)) throw new Error('Thiếu IPC preview/apply Excel -> DB');
if(!/previewExcelDbSync/.test(preload) || !/applyExcelDbSync/.test(preload)) throw new Error('Preload chưa expose manual Excel -> DB');
if(/setInterval\(\(\) => void syncEditedExcelFilesToDb/.test(main)) throw new Error('Không được tự động Excel -> DB bằng watcher');
if(!/EXCEL_UNSYNCED_CHANGES/.test(main)) throw new Error('Thiếu guard chống ghi đè Excel chưa sync');
if(!/preview/.test(sync) || !/SL OK/.test(sync)) throw new Error('Thiếu diff preview trước -> sau');

if(!/Missing Excel columns mean/.test(sync) || !/preserved/.test(sync)) throw new Error('Thiếu guard giữ nguyên detail DB không có cột trong Excel');
if(!/if \(!preview\.length\) continue/.test(sync)) throw new Error('Preview phải bỏ report không có field thay đổi thật');
if(!/changedPatch/.test(sync) || !/patch: changedPatch/.test(sync)) throw new Error('Excel sync phải chỉ gửi field thực sự thay đổi');
if(!/stableValue/.test(sync)) throw new Error('Thiếu canonical deep comparison chống false diff do thứ tự key');

if(!/TAY MÁY CẮT LỒNG/.test(workbook)) throw new Error('Thiếu sheet phụ TAY MÁY CẮT LỒNG');
if(!/STT số nguyên dương/.test(workbook) || !/STT số nguyên dương/.test(sync)) throw new Error('Thiếu guard bỏ qua dòng ngày/TỔNG CỘNG khi sync Excel');
if(!/parseGcHelperSheet/.test(sync) || !/gcMissingFields/.test(sync)) throw new Error('Excel sync chưa đọc/validate metadata Cắt-Lồng từ sheet phụ');
if(!/Dòng mới CẮT\/LỒNG thiếu/.test(sync)) throw new Error('Thiếu cảnh báo chi tiết metadata dòng mới Cắt/Lồng');

if(!/MAX_AUTO_SOURCE_ROW/.test(workbook) || !/fullCalcOnLoad/.test(workbook)) throw new Error('Sheet TAY MÁY CẮT LỒNG chưa tự liên kết công thức với sheet chính');
if(!/value && typeof value === 'object' && value.result !== undefined/.test(sync)) throw new Error('Excel sync chưa đọc cached result của ô công thức sheet phụ');

console.log('[KTC] Excel <-> DB manual preview/apply contract OK');
