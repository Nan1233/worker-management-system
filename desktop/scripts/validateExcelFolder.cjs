const fs=require('node:fs');
const path=require('node:path');
const ExcelJS=require('exceljs');
const {PROCESS_SHEETS,PROCESS_FILE_PREFIXES}=require('../electron/monthlyWorkbookLocal.cjs');
const root=path.resolve(process.argv[2]||'.');
const month=String(process.argv[3]||'').trim();
if(!/^\d{4}-\d{2}$/.test(month)){console.error('Cách dùng: node scripts/validateExcelFolder.cjs <folder> YYYY-MM');process.exit(2);}
const [year,mm]=month.split('-'); const suffix=`${mm}-${year}.xlsx`; const expected=['00_TONG_HOP_SAN_XUAT_'+suffix,...Object.keys(PROCESS_SHEETS).map(c=>`${PROCESS_FILE_PREFIXES[c]}_${suffix}`)];
(async()=>{ const errors=[]; for(const name of expected) if(!fs.existsSync(path.join(root,name))) errors.push(`Thiếu file ${name}`); if(errors.length) throw new Error(errors.join('\n'));
 for(const [code,cfg] of Object.entries(PROCESS_SHEETS)){ const name=`${PROCESS_FILE_PREFIXES[code]}_${suffix}`; const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(root,name)); const visible=wb.worksheets.filter(s=>!['hidden','veryHidden'].includes(s.state)).map(s=>s.name); if(visible.length!==1||visible[0]!==cfg.sheet) errors.push(`${name}: sheet hiển thị ${visible.join(',')}`); const sh=wb.getWorksheet(cfg.sheet); if(!sh) continue; const header=sh.getRow(5).values.map(v=>String(v||'')); for(const h of ['Mã NV','Tên NV','Thời gian nhập','% học việc','Định mức','OK','Tổng NG','SP/giờ','Tỷ lệ NG']) if(!header.includes(h)) errors.push(`${name}: thiếu cột ${h}`); if(sh.views?.[0]?.xSplit!==4) errors.push(`${name}: freeze xSplit phải = 4`); }
 const sum=new ExcelJS.Workbook(); await sum.xlsx.readFile(path.join(root,'00_TONG_HOP_SAN_XUAT_'+suffix)); for(const sh of ['BÌA','TỔNG HỢP THÁNG','ĐỐI CHIẾU DỮ LIỆU']) if(!sum.getWorksheet(sh)) errors.push(`00 tổng hợp thiếu sheet ${sh}`);
 if(errors.length) throw new Error(errors.join('\n')); console.log(JSON.stringify({success:true,folder:root,month,files:expected.length,processes:Object.keys(PROCESS_SHEETS).length},null,2));
})().catch(e=>{console.error('[KTC] Excel folder validation failed:\n'+e.message);process.exit(1);});
