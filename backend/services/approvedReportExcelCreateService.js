const db = require('../config/db');
const AuditService = require('./auditService');
const { validateProductionReport } = require('../utils/reportValidation');
const { validateMasterData } = require('./reportBusinessValidationService');
const { calculateActualOutput } = require('../utils/outputCalculation');
const { validateMachineLines } = require('./machineLineValidationService');
const { validateFactoryMachineRules, validateMachineWorkerCapacity } = require('./factoryMachineRuleService');
const ReportGovernanceService = require('./reportGovernanceService');

function httpError(status, code, message, details) {
  const e = new Error(message); e.status=status; e.code=code; e.isPublic=true; if(details)e.details=details; return e;
}
const text=(v)=>String(v??'').trim();
const mode=(v)=>{const x=text(v).toUpperCase(); return ['MÁY','MAY','MACHINE'].includes(x)?'MACHINE':['TAY','MANUAL','THỦ CÔNG','THU CONG'].includes(x)?'MANUAL':x||'MANUAL';};
const opType=(v)=>{const x=text(v).toUpperCase(); return ['CẮT','CAT','CUT'].includes(x)?'CUT':['LỒNG','LONG','NEST'].includes(x)?'NEST':x||null;};

async function createApprovedReportFromExcel({ data, userId, req=null, sourceMeta=null }) {
  const workerCode=text(data?.worker_code), processCode=text(data?.process_code).toUpperCase();
  if(!workerCode || !processCode) throw httpError(422,'EXCEL_CREATE_IDENTITY_REQUIRED','Dòng mới thiếu Mã NV hoặc công đoạn');
  const [[workers],[processes]] = await Promise.all([
    db.promise().query(`SELECT w.id FROM workers w WHERE TRIM(w.worker_code)=? AND COALESCE(w.status,'active')='active' LIMIT 2`,[workerCode]),
    db.promise().query(`SELECT id,process_code FROM processes WHERE UPPER(TRIM(process_code))=? AND COALESCE(status,'active')='active' LIMIT 2`,[processCode])
  ]);
  if(workers.length!==1) throw httpError(422,'WORKER_NOT_FOUND','Mã nhân viên không tồn tại hoặc không duy nhất');
  if(processes.length!==1) throw httpError(422,'PROCESS_NOT_FOUND','Công đoạn Excel không tồn tại trong DB');
  const workerId=Number(workers[0].id), processId=Number(processes[0].id);
  const operationMode=mode(data.operation_mode), operationType=opType(data.operation_type);
  if(processCode==='GC' && !['CUT','NEST'].includes(operationType||'')) throw httpError(422,'GC_OPERATION_TYPE_REQUIRED','Cắt/Lồng phải chọn Loại thao tác CẮT hoặc LỒNG');
  const deductions=Array.isArray(data.deductions)?data.deductions:[];
  const defects=Array.isArray(data.defects)?data.defects:[];
  const deductionTime=deductions.reduce((s,x)=>s+Number(x?.hours||0),0);
  const ttNg=defects.reduce((s,x)=>s+Number(x?.quantity||0),0);
  const actualTime=Number(data.actual_time||0), ttOk=Number(data.tt_ok||0);
  const machineNo=text(data.machine_no)||null, productName=text(data.product_name)||null;
  if(machineNo && machineNo.includes(',')) throw httpError(422,'EXCEL_MULTI_MACHINE_NOT_SUPPORTED','Dòng Excel mới chỉ hỗ trợ một máy. Báo cáo nhiều máy hãy tạo trên màn hình chi tiết.');

  let master = await validateMasterData({workerId,processId,machineNo,productName,defects,deductions,allowEmptyMachine:operationMode==='MANUAL'});
  if(!master.valid) throw httpError(422,'MASTER_DATA_INVALID','Dữ liệu danh mục không hợp lệ',master.errors);
  let standardOutput=Number(master.standardOutput||0), actualOutput=calculateActualOutput({ttOk,defects,excludeKqdFromTt:Boolean(master.excludeKqdFromTt)});
  let machineLine=null;
  if(operationMode==='MACHINE') {
    if(!machineNo) throw httpError(422,'MACHINE_REQUIRED','Chế độ Máy phải nhập máy');
    const mv=await validateMachineLines({processId,machineLines:[{machine_code:machineNo,product_code:productName,machine_time_hours:actualTime,ok_quantity:ttOk,ng_quantity:ttNg,defects}],operationType,operationMode:'MACHINE',maxMachines:1});
    if(!mv.valid) throw httpError(422,'MACHINE_DATA_INVALID','Thông tin máy không hợp lệ',mv.errors);
    machineLine=mv.lines[0]; standardOutput=Number(machineLine.standard_output||standardOutput); actualOutput=Number(machineLine.counted_output||actualOutput);
    const fr=await validateFactoryMachineRules({processCode,processId,machineLines:[machineLine]});
    if(!fr.valid) throw httpError(422,'FACTORY_MACHINE_RULE_INVALID','Cách sử dụng máy không đúng quy tắc xưởng',fr.errors);
    const cap=await validateMachineWorkerCapacity({processCode,processId,machineLines:[machineLine],workerId,workDate:data.work_date,shift:data.shift});
    if(!cap.valid) throw httpError(422,'MACHINE_CAPACITY_EXCEEDED','Máy đã đủ số người cho phép trong ngày/ca',cap.errors);
  }
  const candidate={...data,worker_id:workerId,process_id:processId,operation_type:operationType,operation_mode:operationMode,machine_no:operationMode==='MANUAL'?null:machineNo,product_name:master.productCode||productName,deduction_time:deductionTime,total_time:actualTime+deductionTime,standard_output:standardOutput,actual_output:actualOutput,tt_ng:ttNg,defects,deductions,exclude_kqd_from_tt:Number(master.excludeKqdFromTt||0)};
  const validation=validateProductionReport(candidate,{enforceBackDate:false});
  if(!validation.valid) throw httpError(422,'REPORT_VALIDATION_FAILED','Dữ liệu báo cáo không hợp lệ',validation.errors);
  if(await ReportGovernanceService.isPeriodLocked(validation.normalized.work_date,processId)) throw httpError(423,'REPORTING_PERIOD_LOCKED','Kỳ báo cáo đã khóa');

  const conn=await db.promise().getConnection();
  try{
    await conn.beginTransaction();
    const [dups]=await conn.query(`SELECT id FROM production_reports WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND machine_no <=> ? AND product_name <=> ? LIMIT 1 FOR UPDATE`,[workerId,processId,validation.normalized.work_date,validation.normalized.shift,validation.normalized.machine_no,validation.normalized.product_name]);
    if(dups.length) throw httpError(409,'DUPLICATE_REPORT',`Đã có báo cáo #${dups[0].id} cùng công nhân/ngày/ca/máy/sản phẩm`);
    const [ins]=await conn.query(`INSERT INTO production_reports (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,product_name,total_time,actual_time,deduction_time,standard_output,actual_output,tt_ok,tt_ng,note,extra_data,status,reviewed_by,approved_at,updated_by) VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,NOW(),?)`,[
      workerId,processId,validation.normalized.work_date,new Date().toISOString().slice(0,10),validation.normalized.shift,operationType,operationMode,validation.normalized.machine_no,validation.normalized.product_name,validation.normalized.total_time,validation.normalized.actual_time,validation.normalized.deduction_time,validation.normalized.standard_output,validation.normalized.actual_output,validation.normalized.tt_ok,validation.normalized.tt_ng,validation.normalized.note,JSON.stringify(data.extra_data||{}),userId,userId]);
    const id=Number(ins.insertId);
    for(const d of validation.normalized.defects) await conn.query('INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)',[id,d.defect_type_id,d.quantity]);
    for(const d of validation.normalized.deductions) await conn.query('INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)',[id,d.deduction_type_id,d.hours]);
    if(machineLine){
      const [ml] = await conn.query(`INSERT INTO production_report_machine_lines(report_id,machine_id,machine_code,product_standard_id,product_code,machine_time_hours,standard_time_seconds,standard_output,standard_source,exclude_kqd_from_tt,ok_quantity,ng_quantity,maximum_output,counted_output,earned_standard_hours,defects_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,machineLine.machine_id||null,machineLine.machine_code,machineLine.product_standard_id||null,machineLine.product_code,machineLine.machine_time_hours,machineLine.standard_time_seconds||null,machineLine.standard_output,machineLine.standard_source||'PRODUCT',Number(machineLine.exclude_kqd_from_tt||0),machineLine.ok_quantity,machineLine.ng_quantity,machineLine.maximum_output,machineLine.counted_output||0,machineLine.earned_standard_hours||0,JSON.stringify(machineLine.defects||[])]);
      for (const defect of machineLine.defects || []) {
        await conn.query(`INSERT INTO production_report_machine_defects(machine_line_id,defect_type_id,defect_code,defect_name,quantity) VALUES(?,?,?,?,?)`,[Number(ml.insertId),defect.defect_type_id||null,text(defect.defect_code)||`ID_${defect.defect_type_id||0}`,text(defect.defect_name)||null,Number(defect.quantity||0)]);
      }
    }
    const [rows]=await conn.query('SELECT * FROM production_reports WHERE id=?',[id]);
    const snapshot={...rows[0],defects:validation.normalized.defects,deductions:validation.normalized.deductions};
    const version=await AuditService.createReportVersion({reportType:'approved',reportId:id,snapshot,reason:`Tạo mới từ Excel: ${sourceMeta?.file||'Desktop'}`,userId},conn);
    await AuditService.logActivity({userId,action:'REPORT_CREATED_FROM_EXCEL',entityType:'approved_report',entityId:id,description:`Tạo báo cáo chính thức #${id} từ Excel`,metadata:{source_file:sourceMeta?.file||null,source_sheet:sourceMeta?.sheet||null,source_row:sourceMeta?.row||null,process_code:processCode,worker_code:workerCode,version},req},conn);
    await conn.commit(); return {report:snapshot,version};
  }catch(e){await conn.rollback().catch(()=>{}); throw e;}finally{conn.release();}
}
module.exports={createApprovedReportFromExcel};
