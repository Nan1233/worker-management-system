'use strict';
const { syncOriginalPatch, addPhysicalMachineEventsMetadata }=require('./monthlyWorkbookSyncMetadata.cjs');
const { normalizeEditable, normalizeOperationMode, excelDateToIso }=require('./excelDbSyncValues.cjs');
const { detailId }=require('./monthlyWorkbookDetails.cjs');
const { EXCEL_CONTRACT_VERSION:EXCEL_SYNC_CONTRACT_VERSION }=require('./monthlyWorkbookLocal.cjs');
const { normalizeYearMonth }=require('./monthlyExcelContract.cjs');

function syncColumns(contract,code) {
  const names={stt:'stt',id:'id',workerCode:'workerCode',date:'date',shift:'shift',operationType:'operationType',operationMode:'operationMode',machine:'machine',training:'training',actualTime:'actualTime',ok:'ok',note:'note'};
  // CVK's product column displays a work-type code, not product_name.
  if(code!=='CVK')names.product='product';
  const result=[];
  for(const [key,name] of Object.entries(names)){
    const index=Number(contract.cols[key] || (key==='actualTime'&&contract.timeKind==='ACTUAL'?contract.cols.time:0));
    if(Number.isSafeInteger(index)&&index>0)result.push({key:name,index});
  }
  // Multiple aliases may share one physical column. Do not expose ambiguous
  // detail mappings as editable DB type IDs.
  for(const [kind,items] of [['deduction',contract.deductions],['defect',contract.defects]]){
    const entries=items.map(item=>({index:Number(item.column),typeId:detailId(item.type,kind)})).filter(item=>item.typeId&&item.index>0);
    for(const item of entries){
      if(entries.filter(other=>other.index===item.index||other.typeId===item.typeId).length!==1)continue;
      result.push({...item,key:kind+':id:'+item.typeId});
    }
  }
  return result;
}
function addWorkerReportSyncMetadata(workbook,sheet,{code,date,processData,reports,contract,firstDataRow,grouped}){
  const columns=syncColumns(contract,code);
  if(!columns.some(col=>col.key==='id')||!columns.some(col=>col.key==='workerCode'))throw new Error('Template thiếu mã báo cáo hoặc mã công nhân.');
  const metaOld=workbook.getWorksheet('_KTC_SYNC');
  if(metaOld)workbook.removeWorksheet(metaOld.id);
  const metadata=workbook.addWorksheet('_KTC_SYNC');
  metadata.state='veryHidden';
  metadata.getCell('A1').value=JSON.stringify({version:EXCEL_SYNC_CONTRACT_VERSION,processCode:code,sheetName:sheet.name,yearMonth:normalizeYearMonth(date),generatedAt:new Date().toISOString(),firstDataRow,rowIdentityMode:'KTC_SYNC_ID_V1',allowCreate:false,columns});
  metadata.addRow(['report_id','expected_updated_at','operation_mode','original_json','source_row','worker_code','work_date','row_stt']);
  const byId=new Map(reports.map(report=>[Number(report.id),report]));
  if(byId.size!==reports.length)throw new Error('Báo cáo trùng ID trong dữ liệu xuất Excel.');
  const written=new Set();
  for(let row=firstDataRow;row<=sheet.rowCount;row++){
    const current=Object.fromEntries(columns.map(col=>[col.key,sheet.getCell(row,col.index).value]));
    const id=Number(current.id);
    if(!Number.isSafeInteger(id)||id<=0)continue;
    const report=byId.get(id);
    if(!report||written.has(id))throw new Error('ID dòng Excel không hợp lệ: '+id);
    const workDate=String(report.work_date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||workDate.slice(0,7)!==normalizeYearMonth(date))throw new Error('Ngày báo cáo không thuộc kỳ xuất Excel: '+id);
    if(!grouped&&excelDateToIso(current.date)!==workDate)throw new Error('Thiếu ngày sản xuất trên dòng Excel: '+id);
    const original=syncOriginalPatch(report);
    const baseline=normalizeEditable({...current,workDate},columns,normalizeOperationMode(current.operationMode)||report.operation_mode,original);
    metadata.addRow([id,report.updated_at||report.created_at||null,report.operation_mode||'',JSON.stringify({...original,excel_baseline:baseline}),row,report.worker_code,workDate,Number(current.stt)||null]);
    written.add(id);
  }
  if(written.size!==reports.length)throw new Error('Không đủ ánh xạ báo cáo trong Excel.');
  addPhysicalMachineEventsMetadata(workbook,processData);
}
module.exports={addWorkerReportSyncMetadata};
