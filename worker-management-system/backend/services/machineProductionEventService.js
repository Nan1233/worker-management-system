const getDb = () => require('../config/db');
const getAuditService = () => require('./auditService');
const { createStandardResolver } = require('./standardResolutionService');
const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');
const { canonicalMachineNumber, GC_SHARED_MACHINE_NUMBERS, getGcMachineRule } = require('./factoryMachineRuleService');
const { assertProcessScope } = require('./processAuthorizationService');

function eventError(status, code, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function isoDate(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
    : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw eventError(422, 'INVALID_WORK_DATE', 'Ngày sản xuất không hợp lệ');
  return text;
}

function normalizeShift(value) {
  const shift = String(value || '').trim();
  if (!shift) throw eventError(422, 'SHIFT_REQUIRED', 'Thiếu ca sản xuất');
  return shift;
}

function positiveHours(value, field = 'machine_time_hours') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw eventError(422, 'INVALID_MACHINE_TIME', `${field} phải là số dương`);
  return number;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw eventError(422, 'INVALID_QUANTITY', `${field} phải là số nguyên không âm`);
  }
  return number;
}

function isSharedEventManaged(processCode, machineCode) {
  return String(processCode || '').trim().toUpperCase() === 'GC'
    && GC_SHARED_MACHINE_NUMBERS.includes(canonicalMachineNumber(machineCode));
}

function q(executor, sql, params = []) {
  if (executor?.promise) return executor.promise().query(sql, params).then(([rows]) => rows);
  const ctor = String(executor?.constructor?.name || '');
  if (ctor.includes('Promise')) return executor.query(sql, params).then(([rows]) => rows);
  return new Promise((resolve, reject) => {
    executor.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function assertActorProcessScope(executor, actor, processId) {
  try {
    await assertProcessScope(actor, processId, { executor, action: 'MACHINE_EVENT_MANAGE' });
    return true;
  } catch (error) {
    if (error?.code === 'PROCESS_SCOPE_FORBIDDEN') {
      throw eventError(403, error.code, error.message, error.details);
    }
    throw error;
  }
}

async function loadEventContext(executor, { processId, machineId = null, machineCode = null, productCode, workDate }) {
  const processRows = await q(executor, `SELECT id, process_code, process_name FROM processes WHERE id=? AND status='active' LIMIT 2`, [Number(processId)]);
  if (processRows.length !== 1) throw eventError(422, 'PROCESS_NOT_FOUND', 'Công đoạn không hợp lệ');
  const process = processRows[0];
  const mId = Number(machineId) || null;
  const mCode = String(machineCode || '').trim();
  const machineRows = await q(executor, `SELECT id, process_id, machine_code, COALESCE(max_workers_per_machine,1) max_workers_per_machine,
      COALESCE(is_automatic,0) is_automatic, COALESCE(output_basis,'PRODUCT') output_basis
      FROM machines WHERE process_id=? AND status='active'
      AND (? IS NULL OR id=?) AND (?='' OR UPPER(TRIM(machine_code))=UPPER(?)) LIMIT 2`,
      [Number(processId), mId, mId, mCode, mCode]);
  if (machineRows.length !== 1) throw eventError(422, 'MACHINE_NOT_FOUND', 'Máy không tồn tại hoặc không thuộc công đoạn');
  const machine = machineRows[0];
  if (!isSharedEventManaged(process.process_code, machine.machine_code)) {
    throw eventError(422, 'MACHINE_EVENT_NOT_REQUIRED', 'Máy này không thuộc nhóm shared-machine event-managed');
  }
  const resolver = createStandardResolver({ query: (sql, params=[]) => q(executor, sql, params) });
  const resolved = await resolver.resolveStandard({
    processId: Number(process.id), productCode: String(productCode || '').trim(), machineId: Number(machine.id), machineCode: machine.machine_code, workDate: isoDate(workDate)
  });
  return { process, machine, resolved };
}

async function authoritativeDefects(executor, processId, defects) {
  const items = Array.isArray(defects) ? defects : [];
  const result = [];
  for (const raw of items) {
    const defectId = Number(raw?.defect_type_id || raw?.defect_id) || null;
    const defectCode = String(raw?.defect_code || '').trim();
    const rows = defectId
      ? await q(executor, `SELECT id, defect_code, defect_name FROM defect_types WHERE id=? AND process_id=? AND status='active' LIMIT 2`, [defectId, Number(processId)])
      : await q(executor, `SELECT id, defect_code, defect_name FROM defect_types WHERE UPPER(TRIM(defect_code))=UPPER(?) AND process_id=? AND status='active' LIMIT 2`, [defectCode, Number(processId)]);
    if (rows.length !== 1) throw eventError(422, 'DEFECT_NOT_FOUND', `Loại NG ${defectCode || defectId || '-'} không hợp lệ`);
    const quantity = nonNegativeInteger(raw?.quantity || 0, 'quantity');
    if (quantity <= 0) continue;
    const responsibleWorkerId = Number(raw?.responsible_worker_id);
    if (!Number.isInteger(responsibleWorkerId) || responsibleWorkerId <= 0) {
      throw eventError(422, 'DEFECT_RESPONSIBLE_WORKER_REQUIRED', 'Mỗi NG vật lý phải có công nhân chịu trách nhiệm');
    }
    result.push({
      defect_type_id: Number(rows[0].id), defect_code: rows[0].defect_code, defect_name: rows[0].defect_name,
      quantity, responsible_worker_id: responsibleWorkerId
    });
  }
  return result;
}

async function participantRows(executor, eventId) {
  return q(executor, `SELECT * FROM (
    SELECT 'temp' source, ml.id machine_line_id, r.id report_id, r.worker_id, r.status report_status,
           r.process_id, r.work_date, r.shift, ml.machine_id, ml.machine_code, ml.product_code,
           ml.counted_output credited_output, ml.machine_time_hours participation_time_hours
      FROM production_temp_machine_lines ml JOIN production_reports_temp r ON r.id=ml.temp_report_id
     WHERE ml.machine_event_id=?
    UNION ALL
    SELECT 'approved' source, ml.id machine_line_id, r.id report_id, r.worker_id, r.status report_status,
           r.process_id, r.work_date, r.shift, ml.machine_id, ml.machine_code, ml.product_code,
           ml.counted_output credited_output, ml.machine_time_hours participation_time_hours
      FROM production_report_machine_lines ml JOIN production_reports r ON r.id=ml.report_id
     WHERE ml.machine_event_id=?
  ) x ORDER BY worker_id, source, machine_line_id`, [Number(eventId), Number(eventId)]);
}

async function assertParticipantLimit(executor, event) {
  const rows = await participantRows(executor, event.id);
  const workers = new Set(rows.map((row) => Number(row.worker_id)).filter(Boolean));
  const machineRows = await q(executor, `SELECT machine_code,max_workers_per_machine,is_automatic,output_basis FROM machines WHERE id=? LIMIT 1`, [Number(event.machine_id)]);
  const rule = getGcMachineRule(event.machine_code, machineRows[0] || null);
  if (workers.size > rule.maxWorkers) throw eventError(422, 'MACHINE_WORKER_LIMIT_EXCEEDED', `Máy ${event.machine_code} chỉ cho phép tối đa ${rule.maxWorkers} người trong cùng ngày/ca`);
  return { rows, workerIds: [...workers], maxWorkers: rule.maxWorkers };
}

async function assertEventDefectWorkers(executor, eventId, defects = null) {
  const participants = await participantRows(executor, eventId);
  const participantIds = new Set(participants.map((row) => Number(row.worker_id)).filter(Boolean));
  const rows = defects || await q(executor, `SELECT responsible_worker_id,quantity FROM machine_production_event_defects WHERE machine_event_id=?`, [Number(eventId)]);
  for (const defect of rows) {
    if (!participantIds.has(Number(defect.responsible_worker_id))) {
      throw eventError(422, 'DEFECT_WORKER_NOT_PARTICIPANT', 'Công nhân chịu trách nhiệm NG phải tham gia production event');
    }
  }
  return participants;
}

async function loadEvent(executor, id, { lock = false } = {}) {
  const rows = await q(executor, `SELECT e.*, p.process_code, p.process_name
    FROM machine_production_events e JOIN processes p ON p.id=e.process_id
    WHERE e.id=? ${lock ? 'FOR UPDATE' : ''}`, [Number(id)]);
  if (!rows[0]) throw eventError(404, 'MACHINE_EVENT_NOT_FOUND', 'Không tìm thấy production event');
  return rows[0];
}

async function linkTempLines(executor, event, tempLineIds = []) {
  const ids = [...new Set((Array.isArray(tempLineIds) ? tempLineIds : []).map(Number).filter((id)=>Number.isInteger(id)&&id>0))];
  if (!ids.length) return [];
  const placeholders = ids.map(()=>'?').join(',');
  const rows = await q(executor, `SELECT ml.id, ml.machine_event_id, ml.machine_id, ml.machine_code, ml.product_code,
       r.id report_id, r.worker_id, r.process_id, r.work_date, r.shift, r.status
     FROM production_temp_machine_lines ml JOIN production_reports_temp r ON r.id=ml.temp_report_id
     WHERE ml.id IN (${placeholders}) FOR UPDATE`, ids);
  if (rows.length !== ids.length) throw eventError(422, 'MACHINE_LINE_NOT_FOUND', 'Có dòng máy chờ duyệt không tồn tại');
  for (const row of rows) {
    const same = Number(row.process_id)===Number(event.process_id)
      && Number(row.machine_id)===Number(event.machine_id)
      && String(row.product_code||'').trim()===String(event.product_code||'').trim()
      && isoDate(row.work_date)===isoDate(event.work_date)
      && String(row.shift||'').trim()===String(event.shift||'').trim();
    if (!same) throw eventError(422, 'MACHINE_EVENT_DIMENSION_MISMATCH', `Dòng máy #${row.id} không khớp công đoạn/máy/sản phẩm/ngày/ca của event`);
  }
  await q(executor, `UPDATE production_temp_machine_lines SET machine_event_id=? WHERE id IN (${placeholders})`, [Number(event.id), ...ids]);
  await assertParticipantLimit(executor, event);
  return rows;
}

function calculateEventPhysical({ physicalOkQuantity, defects, excludeKqdFromTt, machineTimeHours, standardOutput }) {
  const ok = nonNegativeInteger(physicalOkQuantity || 0, 'physical_ok_quantity');
  const output = calculateProductionOutput({ ok, defects, excludeKqdFromTt: Number(excludeKqdFromTt)===1 });
  return {
    physicalOkQuantity: ok,
    physicalNgQuantity: output.totalNg,
    physicalCountedOutput: output.actualOutput,
    physicalTotalOutput: ok + output.totalNg,
    machineTimeHours: positiveHours(machineTimeHours),
    maximumOutput: Number(standardOutput) * positiveHours(machineTimeHours)
  };
}

async function createEvent({ actor, data, req = null }) {
  const connection = await getDb().promise().getConnection();
  try {
    await connection.beginTransaction();
    const workDate = isoDate(data.work_date);
    const shift = normalizeShift(data.shift);
    const ctx = await loadEventContext(connection, { processId:data.process_id, machineId:data.machine_id, machineCode:data.machine_code, productCode:data.product_code, workDate });
    await assertActorProcessScope(connection, actor, ctx.process.id);
    const defects = await authoritativeDefects(connection, ctx.process.id, data.defects);
    const calc = calculateEventPhysical({ physicalOkQuantity:data.physical_ok_quantity, defects, excludeKqdFromTt:ctx.resolved.excludeKqdFromTt, machineTimeHours:data.machine_time_hours, standardOutput:ctx.resolved.standardOutput });
    const [insert] = await connection.query(`INSERT INTO machine_production_events
      (process_id,machine_id,machine_code,product_code,work_date,shift,physical_ok_quantity,physical_ng_quantity,
       physical_counted_output,physical_total_output,machine_time_hours,maximum_output,standard_output,standard_version_id,
       machine_standard_id,standard_source,exclude_kqd_from_tt_snapshot,status,created_by,updated_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`, [
      ctx.process.id,ctx.machine.id,ctx.machine.machine_code,ctx.resolved.productCode,workDate,shift,
      calc.physicalOkQuantity,calc.physicalNgQuantity,calc.physicalCountedOutput,calc.physicalTotalOutput,calc.machineTimeHours,calc.maximumOutput,
      ctx.resolved.standardOutput,ctx.resolved.standardVersionId,ctx.resolved.machineStandardId,ctx.resolved.source,ctx.resolved.excludeKqdFromTt,
      Number(actor.id),Number(actor.id)
    ]);
    const event = await loadEvent(connection, insert.insertId, { lock:true });
    await linkTempLines(connection, event, data.temp_machine_line_ids || []);
    const participants = await participantRows(connection, event.id);
    const participantIds = new Set(participants.map((row)=>Number(row.worker_id)));
    for (const defect of defects) {
      if (!participantIds.has(defect.responsible_worker_id)) throw eventError(422,'DEFECT_WORKER_NOT_PARTICIPANT','Công nhân chịu trách nhiệm NG phải là participant của event');
      await connection.query(`INSERT INTO machine_production_event_defects(machine_event_id,defect_type_id,defect_code,defect_name,quantity,responsible_worker_id)
        VALUES(?,?,?,?,?,?)`, [event.id,defect.defect_type_id,defect.defect_code,defect.defect_name,defect.quantity,defect.responsible_worker_id]);
    }
    await getAuditService().logActivity({ userId:actor.id, action:'MACHINE_EVENT_CREATED', entityType:'machine_production_event', entityId:event.id,
      description:`Tạo production event máy ${event.machine_code} / ${event.product_code}`, metadata:{physical_counted_output:calc.physicalCountedOutput,participant_count:new Set(participants.map((r)=>Number(r.worker_id))).size}, req }, connection);
    await connection.commit();
    return getEvent(event.id, actor);
  } catch (error) { await connection.rollback().catch(()=>{}); throw error; }
  finally { connection.release(); }
}

async function updateEvent({ id, actor, patch, req = null }) {
  const connection = await getDb().promise().getConnection();
  try {
    await connection.beginTransaction();
    const before = await loadEvent(connection, id, { lock:true });
    await assertActorProcessScope(connection, actor, before.process_id);
    if (String(before.status).toLowerCase()==='approved' && ['process_id','machine_id','machine_code','product_code','work_date','shift'].some((k)=>Object.prototype.hasOwnProperty.call(patch||{},k))) {
      throw eventError(422,'APPROVED_EVENT_DIMENSIONS_IMMUTABLE','Không đổi công đoạn/máy/sản phẩm/ngày/ca của event đã duyệt');
    }
    const dimensionsChanged = ['process_id','machine_id','machine_code','product_code','work_date','shift'].some((k)=>Object.prototype.hasOwnProperty.call(patch||{},k) && String(patch[k]??'')!==String(before[k]??''));
    const linked = await participantRows(connection, before.id);
    if (dimensionsChanged && linked.length) throw eventError(422,'EVENT_DIMENSION_CHANGE_WITH_PARTICIPANTS','Không đổi dimensions khi event đã có participant; hãy tạo event mới');
    const resulting = { ...before, ...(patch||{}) };
    const ctx = await loadEventContext(connection,{processId:resulting.process_id,machineId:resulting.machine_id,machineCode:resulting.machine_code,productCode:resulting.product_code,workDate:resulting.work_date});
    const defects = Object.prototype.hasOwnProperty.call(patch||{},'defects')
      ? await authoritativeDefects(connection,ctx.process.id,patch.defects)
      : await q(connection,`SELECT defect_type_id,defect_code,defect_name,quantity,responsible_worker_id FROM machine_production_event_defects WHERE machine_event_id=? ORDER BY id`,[before.id]);
    const calc = calculateEventPhysical({physicalOkQuantity:resulting.physical_ok_quantity,defects,excludeKqdFromTt:ctx.resolved.excludeKqdFromTt,machineTimeHours:resulting.machine_time_hours,standardOutput:ctx.resolved.standardOutput});
    if (linked.length) {
      const participantIds=new Set(linked.map((r)=>Number(r.worker_id)));
      for(const d of defects) if(!participantIds.has(Number(d.responsible_worker_id))) throw eventError(422,'DEFECT_WORKER_NOT_PARTICIPANT','Công nhân chịu trách nhiệm NG phải tham gia event');
    }
    await connection.query(`UPDATE machine_production_events SET process_id=?,machine_id=?,machine_code=?,product_code=?,work_date=?,shift=?,
      physical_ok_quantity=?,physical_ng_quantity=?,physical_counted_output=?,physical_total_output=?,machine_time_hours=?,maximum_output=?,
      standard_output=?,standard_version_id=?,machine_standard_id=?,standard_source=?,exclude_kqd_from_tt_snapshot=?,updated_by=?,updated_at=NOW() WHERE id=?`,[
      ctx.process.id,ctx.machine.id,ctx.machine.machine_code,ctx.resolved.productCode,isoDate(resulting.work_date),normalizeShift(resulting.shift),calc.physicalOkQuantity,calc.physicalNgQuantity,
      calc.physicalCountedOutput,calc.physicalTotalOutput,calc.machineTimeHours,calc.maximumOutput,ctx.resolved.standardOutput,ctx.resolved.standardVersionId,
      ctx.resolved.machineStandardId,ctx.resolved.source,ctx.resolved.excludeKqdFromTt,Number(actor.id),before.id]);
    if(Object.prototype.hasOwnProperty.call(patch||{},'defects')){
      await connection.query('DELETE FROM machine_production_event_defects WHERE machine_event_id=?',[before.id]);
      for(const d of defects) await connection.query(`INSERT INTO machine_production_event_defects(machine_event_id,defect_type_id,defect_code,defect_name,quantity,responsible_worker_id) VALUES(?,?,?,?,?,?)`,[before.id,d.defect_type_id,d.defect_code,d.defect_name,d.quantity,d.responsible_worker_id]);
    }
    await getAuditService().logActivity({userId:actor.id,action:'MACHINE_EVENT_UPDATED',entityType:'machine_production_event',entityId:before.id,description:`Cập nhật production event #${before.id}`,metadata:{physical_counted_output:calc.physicalCountedOutput},req},connection);
    await connection.commit();
    return getEvent(before.id, actor);
  }catch(error){await connection.rollback().catch(()=>{});throw error;}finally{connection.release();}
}

async function linkParticipants({ id, actor, tempMachineLineIds, req = null }) {
  const connection=await getDb().promise().getConnection();
  try{await connection.beginTransaction();const event=await loadEvent(connection,id,{lock:true});await assertActorProcessScope(connection,actor,event.process_id);await linkTempLines(connection,event,tempMachineLineIds);
    await assertEventDefectWorkers(connection,event.id);
    await getAuditService().logActivity({userId:actor.id,action:'MACHINE_EVENT_PARTICIPANTS_LINKED',entityType:'machine_production_event',entityId:event.id,description:`Liên kết participant cho event #${event.id}`,metadata:{temp_machine_line_ids:tempMachineLineIds},req},connection);
    await connection.commit();return getEvent(event.id,actor);}catch(error){await connection.rollback().catch(()=>{});throw error;}finally{connection.release();}
}

async function approveEvent({ id, actor, req = null }) {
  const connection=await getDb().promise().getConnection();
  try{await connection.beginTransaction();const event=await loadEvent(connection,id,{lock:true});await assertActorProcessScope(connection,actor,event.process_id);const participantInfo=await assertParticipantLimit(connection,event);
    if(!participantInfo.workerIds.length) throw eventError(422,'MACHINE_EVENT_PARTICIPANTS_REQUIRED','Event phải có ít nhất một worker participant trước khi duyệt');
    await assertEventDefectWorkers(connection,event.id);
    const defectRows=await q(connection,'SELECT quantity FROM machine_production_event_defects WHERE machine_event_id=?',[event.id]);
    const defectTotal=defectRows.reduce((s,r)=>s+Number(r.quantity||0),0);
    if(defectTotal!==Number(event.physical_ng_quantity||0)) throw eventError(422,'MACHINE_EVENT_DEFECT_TOTAL_MISMATCH','Tổng NG event không khớp chi tiết NG');
    await connection.query(`UPDATE machine_production_events SET status='approved',updated_by=?,updated_at=NOW() WHERE id=?`,[Number(actor.id),event.id]);
    await getAuditService().logActivity({userId:actor.id,action:'MACHINE_EVENT_APPROVED',entityType:'machine_production_event',entityId:event.id,description:`Duyệt production event #${event.id}`,metadata:{participant_count:participantInfo.workerIds.length},req},connection);
    await connection.commit();return getEvent(event.id,actor);}catch(error){await connection.rollback().catch(()=>{});throw error;}finally{connection.release();}
}

async function getEvent(id, actor) {
  const runtimeDb=getDb();const event=await loadEvent(runtimeDb,id);await assertActorProcessScope(runtimeDb,actor,event.process_id);
  const [defects,participants]=await Promise.all([q(runtimeDb,'SELECT * FROM machine_production_event_defects WHERE machine_event_id=? ORDER BY id',[event.id]),participantRows(runtimeDb,event.id)]);
  return {...event,defects,participants};
}

async function listEvents({ actor, filters = {} }) {
  const role=String(actor?.role||'').toLowerCase();if(!['admin','manager','lead'].includes(role)) throw eventError(403,'MACHINE_EVENT_FORBIDDEN','Không có quyền xem production event');
  const clauses=[];const params=[];
  if(filters.from){clauses.push('e.work_date>=?');params.push(isoDate(filters.from));}
  if(filters.to){clauses.push('e.work_date<=?');params.push(isoDate(filters.to));}
  if(filters.process_id){clauses.push('e.process_id=?');params.push(Number(filters.process_id));}
  if(filters.machine_id){clauses.push('e.machine_id=?');params.push(Number(filters.machine_id));}
  if(filters.status){clauses.push('e.status=?');params.push(String(filters.status));}
  if(role!=='admin'){clauses.push('EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=e.process_id)');params.push(Number(actor.id));}
  return q(getDb(),`SELECT e.*,p.process_code,p.process_name FROM machine_production_events e JOIN processes p ON p.id=e.process_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY e.work_date DESC,e.id DESC LIMIT 500`,params);
}

async function assertApprovedEventForTempLine(executor,{report,line}){
  const processRows=await q(executor,'SELECT process_code FROM processes WHERE id=? LIMIT 1',[Number(report.process_id)]);
  if(!isSharedEventManaged(processRows[0]?.process_code,line.machine_code)) return true;
  if(!line.machine_event_id) throw eventError(422,'MACHINE_EVENT_REQUIRED',`Máy ${line.machine_code} cần production event vật lý đã duyệt trước khi duyệt báo cáo worker`);
  const rows=await q(executor,`SELECT id,process_id,machine_id,machine_code,product_code,work_date,shift,status FROM machine_production_events WHERE id=? LIMIT 1`,[Number(line.machine_event_id)]);
  const event=rows[0];
  if(!event||String(event.status).toLowerCase()!=='approved') throw eventError(422,'MACHINE_EVENT_REQUIRED',`Production event #${line.machine_event_id||'-'} chưa được duyệt`);
  const same=Number(event.process_id)===Number(report.process_id)&&Number(event.machine_id)===Number(line.machine_id)&&String(event.product_code)===String(line.product_code)&&isoDate(event.work_date)===isoDate(report.work_date)&&String(event.shift)===String(report.shift);
  if(!same) throw eventError(422,'MACHINE_EVENT_DIMENSION_MISMATCH','Production event không khớp dòng máy worker');
  return true;
}

module.exports={eventError,isSharedEventManaged,calculateEventPhysical,createEvent,updateEvent,linkParticipants,approveEvent,getEvent,listEvents,assertApprovedEventForTempLine,participantRows};
