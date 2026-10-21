const defaultQuery = async (sql, params = []) => {
  const db = require('../config/db');
  const [rows] = await db.promise().query(sql, params);
  return rows;
};

const { gcWorkTypeLabel, queryWithOptionalGcWorkType } = require('../utils/gcMachineWorkType');

function businessError(code, message, details = null) { const error = new Error(message); error.status = 422; error.code = code; error.isPublic = true; if (details) error.details = details; return error; }
function normalizeWorkDate(value) { const text = value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : String(value || '').slice(0,10); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw businessError('INVALID_WORK_DATE','Ngày làm việc không hợp lệ'); return text; }
function positiveDecimal(value, code='INVALID_STANDARD_VALUE') { const number=Number(value); if(!Number.isFinite(number)||number<=0) throw businessError(code,'Định mức phải là số dương hợp lệ'); return number; }
function sameDecimal(a,b,tolerance=0.000001){ return Math.abs(Number(a)-Number(b))<=tolerance; }
function assertEffectiveOnDate(row,date,label){const from=row?.effective_from?String(row.effective_from).slice(0,10):null;const to=row?.effective_to?String(row.effective_to).slice(0,10):null;if(from&&from>date)throw businessError('HISTORICAL_STANDARD_NOT_FOUND',`${label} chưa có hiệu lực tại ngày ${date}`,{effective_from:from,effective_to:to});if(to&&to<date)throw businessError('HISTORICAL_STANDARD_NOT_FOUND',`${label} đã hết hiệu lực tại ngày ${date}`,{effective_from:from,effective_to:to});}
function chooseHistoricalVersion(rows,date,label){const applicable=(rows||[]).filter(row=>{const from=row?.effective_from?String(row.effective_from).slice(0,10):null;const to=row?.effective_to?String(row.effective_to).slice(0,10):null;return(!from||from<=date)&&(!to||to>=date)});if(!applicable.length)return null;const active=applicable.filter(row=>String(row.status||'').toLowerCase()==='active'||Number(row.is_active)===1);const candidates=active.length?active:applicable;if(candidates.length>1)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT',`Có nhiều định mức cùng hiệu lực cho ${label} tại ngày ${date}`,{work_date:date,version_ids:candidates.map(r=>Number(r.id)).filter(Boolean)});return candidates[0];}

function normalizeWorkType(value){const code=String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(['CUT','CAT'].includes(code))return 'CUT';if(['LONG','LNG'].includes(code))return 'LONG';return code;}
function normalizeRequestedWorkType({processId,processCode,machineWorkType,workType,machineCode,operationMode}){const explicit=normalizeWorkType(workType);if(explicit==='LONG')return 'Lồng';if(explicit==='CUT')return 'Cắt';const normalizedProcessCode=String(processCode||'').trim().toUpperCase();const isGc=normalizedProcessCode?normalizedProcessCode==='GC':Number(processId)===1;if(isGc){if(machineWorkType)return machineWorkType;if(!String(machineCode||'').trim()&&String(operationMode||'').trim().toUpperCase()==='MANUAL')return 'Lồng';return null;}return null;}

function storedWorkTypeSql(normalizedWorkType){
  // product_standards.work_type is stored with mixed spellings (seeded 'LONG' by
  // migration 051; 'Cắt'/'Lồng' elsewhere). Match only the spellings normalizeWorkType()
  // already treats as Cắt/Lồng. A generic 'GC', NULL or unknown value never matches a
  // specific Cắt/Lồng lookup: that mismatch is reported explicitly instead of guessed.
  if(normalizedWorkType==='LONG')return ` AND UPPER(TRIM(ps.work_type)) IN ('LỒNG','LONG')`;
  if(normalizedWorkType==='CUT')return ` AND UPPER(TRIM(ps.work_type)) IN ('CẮT','CAT','CUT')`;
  return '';
}

function createStandardResolver({query=defaultQuery}={}) {
  const productCache=new Map(), standardCache=new Map();
  async function findProductRows(pid,product,workType=null,{includeInactive=false}={}){
    const normalizedWorkType=normalizeWorkType(workType);
    const workTypeSql=storedWorkTypeSql(normalizedWorkType);
    const statusSql=includeInactive?'':` AND ps.status='active'`;
    const fields=`SELECT id AS product_standard_id, product_code, encoding_code, work_type, standard_output, exclude_kqd_from_tt FROM product_standards ps WHERE process_id=?${statusSql}${workTypeSql}`;
    // Resolve identifiers in strict priority order. Combining product_code and
    // encoding_code in one OR query can return different standards when one
    // product's code equals another product's encoding code. Exact product_code
    // wins; encoding_code is only a fallback when no exact code exists.
    // Keep case-sensitive matching to avoid C1080/c1080 collisions.
    const exactCodeRows=await query(`${fields} AND BINARY TRIM(product_code)=BINARY TRIM(?) ORDER BY id LIMIT 2`,[pid,product]);
    if(exactCodeRows.length)return exactCodeRows;
    const encodingRows=await query(`${fields} AND BINARY TRIM(encoding_code)=BINARY TRIM(?) ORDER BY id LIMIT 2`,[pid,product]);
    if(encodingRows.length)return encodingRows;
    // Resolve aliases only after exact product_code and encoding_code misses.
    // Multiple active canonical targets are a data conflict, never a tie-break.
    const aliasRows=await query(`SELECT DISTINCT product_code FROM product_aliases WHERE process_id=? AND status='active' AND BINARY TRIM(alias_code)=BINARY TRIM(?) ORDER BY product_code LIMIT 2`,[pid,product]);
    const aliasProducts=[...new Set(aliasRows.map(row=>normalizeCode(row?.product_code)).filter(Boolean))];
    if(aliasProducts.length>1)throw businessError('PRODUCT_ALIAS_CONFLICT',`Mã alias ${product} ánh xạ tới nhiều sản phẩm`,{process_id:pid,alias_code:product,product_codes:aliasProducts});
    if(!aliasRows.length)return [];
    return query(`${fields} AND BINARY TRIM(product_code)=BINARY TRIM(?) ORDER BY id LIMIT 2`,[pid,String(aliasRows[0].product_code||'').trim()]);
  }
  function pickEquivalentRow(rows){if(!Array.isArray(rows)||rows.length<2)return null;const out=Number(rows[0]?.standard_output),kqd=Number(rows[0]?.exclude_kqd_from_tt||0);if(!Number.isFinite(out)||out<=0)return null;const allSame=rows.every(row=>sameDecimal(Number(row?.standard_output),out)&&Number(row?.exclude_kqd_from_tt||0)===kqd);return allSame?rows[0]:null;}
  function pickExactRow(rows,product){if(!Array.isArray(rows)||rows.length<2)return null;const wanted=normalizeCode(product);const exact=rows.filter(row=>normalizeCode(row?.product_code)===wanted||normalizeCode(row?.encoding_code)===wanted);return exact.length===1?exact[0]:null;}
  function normalizeCode(value){return String(value||'').trim().toUpperCase();}
  async function selectProductRow(pid,product,workDate,{allowAutoAlias=false,workType=null,includeInactive=false}={}){const lookupOptions={includeInactive};const rows=await findProductRows(pid,product,workType,lookupOptions);if(rows.length===1)return rows[0];const exact=pickExactRow(rows,product);if(exact)return exact;const equivalent=pickEquivalentRow(rows);if(equivalent)return equivalent;if(rows.length>1)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT',`Có nhiều định mức khả dĩ cho sản phẩm ${product} trong cùng công đoạn`,{process_id:pid,product_code:product,work_type:workType||null,conflicting_standard_ids:rows.map(row=>Number(row?.product_standard_id)).filter(Number.isFinite)});const resolveUniqueAutoCaseVariant=async(autoCode)=>{if(!/-AUTO$/i.test(autoCode))return null;const normalizedWorkType=normalizeWorkType(workType);const workTypeSql=storedWorkTypeSql(normalizedWorkType);const statusSql=includeInactive?'':` AND ps.status='active'`;const candidates=await query(`SELECT id AS product_standard_id, product_code, encoding_code, work_type, standard_output, exclude_kqd_from_tt FROM product_standards ps WHERE process_id=?${statusSql}${workTypeSql} AND UPPER(TRIM(product_code))=UPPER(TRIM(?)) ORDER BY id LIMIT 2`,[pid,autoCode]);return candidates.length===1?candidates[0]:null;};const autoCaseVariant=await resolveUniqueAutoCaseVariant(product);if(autoCaseVariant)return autoCaseVariant;if(!allowAutoAlias)return null;const autoProduct=/-AUTO$/i.test(product)?product:`${product}-AUTO`;const autoRows=await findProductRows(pid,autoProduct,workType,lookupOptions);if(autoRows.length===1)return autoRows[0];const exactAuto=pickExactRow(autoRows,autoProduct);if(exactAuto)return exactAuto;const equivalentAuto=pickEquivalentRow(autoRows);if(equivalentAuto)return equivalentAuto;return resolveUniqueAutoCaseVariant(autoProduct);}
  async function resolveProduct({processId,productCode,workDate,standardVersionId=null,allowAutoAlias=false,workType=null}) {
    const pid=Number(processId), product=String(productCode||'').trim(), date=normalizeWorkDate(workDate), normalizedWorkType=normalizeWorkType(workType);
    if((pid===60006||pid===30002)&&!product)return{processId:pid,productCode:null,productStandardId:null,standardVersionId:null,machineStandardId:null,standardOutput:0,standardTimeSeconds:null,excludeKqdFromTt:0,effectiveFrom:null,effectiveTo:null,source:'NON_PRODUCT_WORK',workDate:date,historicalVersionAvailable:false,nonProductWork:true};
    if(!Number.isInteger(pid)||pid<=0||!product)throw businessError('INVALID_STANDARD_LOOKUP','Thiếu công đoạn hoặc sản phẩm để tra định mức');
    const requestedVersionId=Number(standardVersionId)||null, cacheKey=`${pid}|${product}|${date}|${requestedVersionId||''}|auto=${allowAutoAlias?1:0}|work=${normalizedWorkType||''}`;
    if(productCache.has(cacheKey))return productCache.get(cacheKey);
    const historicalSnapshotLookup=Boolean(requestedVersionId);
    // An explicitly saved version is authoritative for an existing report. Permit
    // resolving its product row even if the current master row was deactivated;
    // new lookups without a saved version still require an active product.
    let selectedProduct=null;
    let fallbackToProcessProduct=false;

    // For new AUTO reports, resolve the explicit "-AUTO" master row first.
    // Looking up the base code first can incorrectly select a different standard
    // (e.g. C2556=875) even when C2556-AUTO=5000 exists and is the intended rule.
    // Existing reports with a saved version keep their historical snapshot path.
    if(allowAutoAlias && !requestedVersionId && !/-AUTO$/i.test(product)){
      const autoProduct=`${product}-AUTO`;
      selectedProduct=await selectProductRow(pid,autoProduct,date,{allowAutoAlias:false,workType:normalizedWorkType,includeInactive:false});
      if(!selectedProduct && normalizedWorkType && pid!==1){
        selectedProduct=await selectProductRow(pid,autoProduct,date,{allowAutoAlias:false,workType:null,includeInactive:false});
        fallbackToProcessProduct=Boolean(selectedProduct);
      }
    }

    if(!selectedProduct){
      selectedProduct=await selectProductRow(pid,product,date,{allowAutoAlias:allowAutoAlias&&!requestedVersionId,workType:normalizedWorkType,includeInactive:historicalSnapshotLookup});
      if(!selectedProduct && normalizedWorkType && pid!==1){
        selectedProduct=await selectProductRow(pid,product,date,{allowAutoAlias:allowAutoAlias&&!requestedVersionId,workType:null,includeInactive:historicalSnapshotLookup});
        fallbackToProcessProduct=Boolean(selectedProduct);
      }
    }
    if(!selectedProduct&&normalizedWorkType){
      // Distinguish "product has no standard" from "product has standards, but stored under a
      // different work_type". Never fall back to another work type (fail closed).
      const anyTypeRows=await findProductRows(pid,product,null,{includeInactive:historicalSnapshotLookup});
      // Only a stored value that is not a supported Cắt/Lồng spelling (e.g. generic 'GC', NULL)
      // is a configuration mismatch; a real standard of the OTHER type stays a plain not-found.
      const unsupportedRows=anyTypeRows.filter(row=>!['CUT','LONG'].includes(normalizeWorkType(row?.work_type)));
      if(unsupportedRows.length){
        const stored=[...new Set(unsupportedRows.map(row=>String(row?.work_type??'').trim()||'(trống)'))];
        throw businessError('STANDARD_WORK_TYPE_MISMATCH',`Sản phẩm ${product} có định mức nhưng loại công việc lưu trong danh mục (${stored.join(', ')}) không khớp loại ${normalizedWorkType==='CUT'?'Cắt':'Lồng'} của máy; cần quản trị viên cập nhật danh mục định mức`,{process_id:pid,product_code:product,requested_work_type:normalizedWorkType,stored_work_types:stored});
      }
    }
    if(!selectedProduct)throw businessError('HISTORICAL_STANDARD_NOT_FOUND',`Không xác định duy nhất định mức sản phẩm ${product}${normalizedWorkType?` / ${normalizedWorkType}`:''} trong công đoạn`,{process_id:pid,product_code:product,work_type:normalizedWorkType||null});
    const canonicalProduct=String(selectedProduct.product_code||'').trim();
    const effectiveWorkType=normalizeWorkType(selectedProduct.work_type)||normalizedWorkType||null;
    if(requestedVersionId){const versionRows=await query(`SELECT id,process_id,product_code,standard_output,exclude_kqd_from_tt,version_no,effective_from,effective_to,status FROM product_standard_versions WHERE id=? AND process_id=? AND product_code=? LIMIT 1`,[requestedVersionId,pid,canonicalProduct]);if(versionRows.length!==1)throw businessError('HISTORICAL_STANDARD_NOT_FOUND',`Không tìm thấy định mức lịch sử #${requestedVersionId} cho ${canonicalProduct}`);const version=versionRows[0];assertEffectiveOnDate(version,date,`Định mức lịch sử #${requestedVersionId}`);const r={processId:pid,productCode:canonicalProduct,productStandardId:Number(selectedProduct.product_standard_id),standardVersionId:Number(version.id),machineStandardId:null,standardOutput:positiveDecimal(version.standard_output),standardTimeSeconds:null,excludeKqdFromTt:Number(version.exclude_kqd_from_tt||0)===1?1:0,effectiveFrom:version.effective_from?String(version.effective_from).slice(0,10):null,effectiveTo:version.effective_to?String(version.effective_to).slice(0,10):null,source:fallbackToProcessProduct?'PRODUCT_VERSION_PROCESS_FALLBACK':'PRODUCT_VERSION_SNAPSHOT',workDate:date,historicalVersionAvailable:true,workType:effectiveWorkType};productCache.set(cacheKey,r);return r;}
    const versions=await query(`SELECT id,process_id,product_code,standard_output,exclude_kqd_from_tt,version_no,effective_from,effective_to,status FROM product_standard_versions WHERE process_id=? AND product_code=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from,version_no,id`,[pid,canonicalProduct,date,date]);
    const version=chooseHistoricalVersion(versions,date,canonicalProduct);
    if(!version){const out=Number(selectedProduct.standard_output);if(!Number.isFinite(out)||out<=0)throw businessError('HISTORICAL_STANDARD_NOT_FOUND',`Không có định mức lịch sử cho ${canonicalProduct} tại ngày ${date}`,{process_id:pid,product_code:canonicalProduct,work_type:effectiveWorkType,work_date:date});const r={processId:pid,productCode:canonicalProduct,productStandardId:Number(selectedProduct.product_standard_id),standardVersionId:null,machineStandardId:null,standardOutput:out,standardTimeSeconds:null,excludeKqdFromTt:Number(selectedProduct.exclude_kqd_from_tt||0)===1?1:0,effectiveFrom:null,effectiveTo:null,source:fallbackToProcessProduct?'LEGACY_PRODUCT_STANDARD_PROCESS_FALLBACK':'LEGACY_PRODUCT_STANDARD',workDate:date,historicalVersionAvailable:false,workType:effectiveWorkType};productCache.set(cacheKey,r);return r;}
    const r={processId:pid,productCode:canonicalProduct,productStandardId:Number(selectedProduct.product_standard_id),standardVersionId:Number(version.id),machineStandardId:null,standardOutput:positiveDecimal(version.standard_output),standardTimeSeconds:null,excludeKqdFromTt:Number(version.exclude_kqd_from_tt||0)===1?1:0,effectiveFrom:String(version.effective_from).slice(0,10),effectiveTo:version.effective_to?String(version.effective_to).slice(0,10):null,source:fallbackToProcessProduct?'PRODUCT_VERSION_PROCESS_FALLBACK':(String(version.status||'').toLowerCase()==='active'?'PRODUCT_VERSION':'PRODUCT_VERSION_HISTORICAL'),workDate:date,historicalVersionAvailable:true,workType:effectiveWorkType};productCache.set(cacheKey,r);return r;
  }
  async function resolveStandard({processId,productCode,machineId=null,machineCode=null,workDate,standardVersionId=null,machineStandardId=null,operationMode=null,executionMethod=null,workType=null}) {
    const pid=Number(processId), requestedMachineId=Number(machineId)||null, requestedMachineCode=String(machineCode||'').trim(), requestedVersionId=Number(standardVersionId)||null, requestedMachineStandardId=Number(machineStandardId)||null, requestedProduct=String(productCode||'').trim(), date=normalizeWorkDate(workDate);
    const cacheModeText=String(operationMode||executionMethod||'').trim().toUpperCase();
    const cacheAuto=['AUTO','AUTOMATIC','TỰ ĐỘNG','TU DONG'].includes(cacheModeText)||/AUTO|TỰ\s*ĐỘNG|TU\s*DONG/.test(cacheModeText);
    const cacheKey=`${pid}|${requestedProduct}|${date}|${requestedMachineId||''}|${requestedMachineCode}|v${requestedVersionId||''}|ms${requestedMachineStandardId||''}|mode=${cacheAuto?'AUTO':'NORMAL'}|work=${normalizeWorkType(workType)||''}`;
    if(standardCache.has(cacheKey))return standardCache.get(cacheKey);
    let machineRows=[];
    // Machine master is the source of truth for Cắt/Lồng (machines.gc_work_type); never the code prefix.
    const machineQuery=(sql,params)=>queryWithOptionalGcWorkType(query,(withType)=>withType?sql.replace('SELECT m.id,m.machine_code,p.process_code','SELECT m.id,m.machine_code,m.gc_work_type,p.process_code'):sql,params);
    if(requestedMachineStandardId&&!requestedMachineId&&!requestedMachineCode)machineRows=await machineQuery(`SELECT m.id,m.machine_code,p.process_code FROM machines m JOIN processes p ON p.id=m.process_id JOIN product_machine_standards pms ON pms.machine_id=m.id WHERE m.process_id=? AND pms.id=? LIMIT 2`,[pid,requestedMachineStandardId]);
    else if(requestedMachineId||requestedMachineCode)machineRows=await machineQuery(`SELECT m.id,m.machine_code,p.process_code FROM machines m JOIN processes p ON p.id=m.process_id WHERE m.process_id=? AND m.status='active' AND (? IS NULL OR m.id=?) AND (?='' OR UPPER(TRIM(m.machine_code))=UPPER(TRIM(?))) LIMIT 2`,[pid,requestedMachineId,requestedMachineId,requestedMachineCode,requestedMachineCode]);
    if(machineRows.length>1)throw businessError('MACHINE_NOT_FOUND','Máy xác định không duy nhất trong công đoạn');
    if((requestedMachineId||requestedMachineCode||requestedMachineStandardId)&&machineRows.length!==1)throw businessError('MACHINE_NOT_FOUND','Máy không tồn tại hoặc không thuộc công đoạn');
    const machine=machineRows[0]||null, processCode=String(machine?.process_code||'').trim().toUpperCase();
    const modeText=String(operationMode||executionMethod||'').trim().toUpperCase(), isAuto=['AUTO','AUTOMATIC','TỰ ĐỘNG','TU DONG'].includes(modeText)||/AUTO|TỰ\s*ĐỘNG|TU\s*DONG/.test(modeText);
    const inferredGcWorkType=gcWorkTypeLabel(machine?.gc_work_type);
    const isGcProcess=processCode?processCode==='GC':(pid===1&&(Boolean(inferredGcWorkType)||modeText==='MANUAL'||modeText==='MACHINE'));
    const explicitGcWorkType=normalizeWorkType(workType);
    const resolvedWorkType=normalizeRequestedWorkType({processId:pid,processCode,machineWorkType:inferredGcWorkType,workType,machineCode:machine?.machine_code||requestedMachineCode,operationMode:modeText});
    if(isGcProcess&&inferredGcWorkType&&['CUT','LONG'].includes(explicitGcWorkType)&&explicitGcWorkType!==normalizeWorkType(inferredGcWorkType)){
      throw businessError('GC_WORK_TYPE_MISMATCH',`Loại công việc ${explicitGcWorkType} không khớp với máy ${machine?.machine_code||requestedMachineCode} (${inferredGcWorkType})`,{process_id:pid,machine_code:machine?.machine_code||requestedMachineCode,requested_work_type:explicitGcWorkType,inferred_work_type:normalizeWorkType(inferredGcWorkType)});
    }
    if(isGcProcess&&!resolvedWorkType){
      throw businessError('GC_WORK_TYPE_UNRESOLVED',(machine||requestedMachineCode)?`Máy ${machine?.machine_code||requestedMachineCode} chưa được cấu hình loại gia công (Cắt/Lồng) trong danh mục máy; cần cập nhật danh mục máy trước khi báo cáo`:'Chưa chọn máy hoặc loại công việc Cắt/Lồng',{process_id:pid,machine_code:machine?.machine_code||requestedMachineCode||null,work_type:workType||null});
    }
    if(isGcProcess&&(requestedMachineCode||requestedMachineId||requestedMachineStandardId)&&!inferredGcWorkType){
      throw businessError('GC_WORK_TYPE_UNRESOLVED',`Máy ${machine?.machine_code||requestedMachineCode} chưa được cấu hình loại gia công (Cắt/Lồng) trong danh mục máy; cần cập nhật danh mục máy trước khi báo cáo`,{process_id:pid,machine_code:machine?.machine_code||requestedMachineCode||null,work_type:workType||null});
    }
    const standardKey=cacheKey;
    if(machine){const aliasRows=await query(`SELECT DISTINCT product_code FROM product_aliases WHERE process_id=? AND status='active' AND BINARY TRIM(alias_code)=BINARY TRIM(?) ORDER BY product_code LIMIT 2`,[pid,requestedProduct]);const aliasProducts=[...new Set(aliasRows.map(row=>normalizeCode(row?.product_code)).filter(Boolean))];if(aliasProducts.length>1)throw businessError('PRODUCT_ALIAS_CONFLICT',`Mã alias ${requestedProduct} ánh xạ tới nhiều sản phẩm`,{process_id:pid,alias_code:requestedProduct,product_codes:aliasProducts});const canonicalMachineProduct=aliasRows[0]?.product_code?String(aliasRows[0].product_code).trim():requestedProduct;const rows=await query(`SELECT id,process_id,product_code,machine_id,standard_output,calculated_output_per_hour,standard_time_seconds,effective_from,effective_to,is_active FROM product_machine_standards WHERE process_id=? AND machine_id=? AND BINARY TRIM(product_code)=BINARY TRIM(?) AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>=?) ORDER BY COALESCE(effective_from,'1000-01-01') DESC,id DESC`,[pid,Number(machine.id),canonicalMachineProduct,date,date]);const active=rows.filter(r=>Number(r.is_active)===1),usable=active.length?active:rows;if(usable.length>1)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT',`Có nhiều định mức máy cùng hiệu lực cho ${requestedProduct} / ${machine.machine_code}`);if(usable.length===1){const row=usable[0],out=Number(row.calculated_output_per_hour??row.standard_output);if(Number.isFinite(out)&&out>0){const r={processId:pid,productCode:requestedProduct,productStandardId:null,standardVersionId:null,machineStandardId:Number(row.id),standardOutput:out,standardTimeSeconds:Number(row.standard_time_seconds)>0?Number(row.standard_time_seconds):null,excludeKqdFromTt:0,effectiveFrom:row.effective_from?String(row.effective_from).slice(0,10):null,effectiveTo:row.effective_to?String(row.effective_to).slice(0,10):null,source:Number(row.is_active)===1?'MACHINE':'MACHINE_HISTORICAL',workDate:date,historicalVersionAvailable:true,machineId:Number(machine.id),machineCode:machine.machine_code};standardCache.set(standardKey,r);return r;}}}
    const processAutoEligible=pid===1&&(isAuto||['AUTO','AUTOMATIC'].includes(String(workType||'').trim().toUpperCase()));
    const product=await resolveProduct({processId:pid,productCode:requestedProduct,workDate:date,standardVersionId:requestedVersionId,allowAutoAlias:processAutoEligible,workType:resolvedWorkType});
    const resolvedSource=product.nonProductWork?product.source:(machine?`${product.source}_MACHINE_FALLBACK`:`${product.source}_PROCESS_FALLBACK`);const resolved={...product,machineId:machine?Number(machine.id):null,machineCode:machine?machine.machine_code:null,machineStandardId:null,source:resolvedSource};standardCache.set(standardKey,resolved);return resolved;
  }
  async function validateProductVersionRange({processId,productCode,effectiveFrom,effectiveTo=null,excludeVersionId=null}){const from=normalizeWorkDate(effectiveFrom),to=effectiveTo?normalizeWorkDate(effectiveTo):null;if(to&&to<from)throw businessError('INVALID_STANDARD_EFFECTIVE_RANGE','Ngày kết thúc định mức phải từ ngày bắt đầu trở đi');const rows=await query(`SELECT id FROM product_standard_versions WHERE process_id=? AND product_code=? AND status='active' AND (? IS NULL OR id<>?) AND effective_from<=COALESCE(?, '9999-12-31') AND (effective_to IS NULL OR effective_to>=?) LIMIT 2`,[Number(processId),String(productCode||'').trim(),excludeVersionId?Number(excludeVersionId):null,excludeVersionId?Number(excludeVersionId):null,to,from]);if(rows.length)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT','Khoảng hiệu lực định mức bị chồng lấn',{conflicting_version_ids:rows.map(r=>Number(r.id))});return true;}
  return {resolveProduct,resolveStandard,validateProductVersionRange};
}
function assertStandardSnapshotConsistency({resolved,standardOutput,standardVersionId,machineStandardId=null}){const savedOutput=Number(standardOutput),hasSavedOutput=Number.isFinite(savedOutput)&&savedOutput>0,outputMatches=Boolean(resolved)&&sameDecimal(resolved.standardOutput,standardOutput),versionMatches=Number(resolved?.standardVersionId||0)===Number(standardVersionId||0),machineMatches=Number(resolved?.machineStandardId||0)===Number(machineStandardId||0),hasMachineSnapshotId=Number(machineStandardId||0)>0,hasProductSnapshotId=Number(standardVersionId||0)>0;if(hasMachineSnapshotId&&(!outputMatches||!machineMatches||(hasProductSnapshotId&&!versionMatches)))throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử',{saved_standard_output:standardOutput??null,saved_standard_version_id:standardVersionId??null,saved_machine_standard_id:machineStandardId??null,expected_standard_output:resolved?.standardOutput??null,expected_standard_version_id:resolved?.standardVersionId??null,expected_machine_standard_id:resolved?.machineStandardId??null,expected_source:resolved?.source??null});if(hasProductSnapshotId&&!hasMachineSnapshotId){if(!hasSavedOutput||!outputMatches||!versionMatches)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}if(!hasProductSnapshotId&&!hasMachineSnapshotId){if(!hasSavedOutput)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}if(!resolved||!outputMatches||!versionMatches||!machineMatches)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}
const runtimeResolver=createStandardResolver();
module.exports={...runtimeResolver,createStandardResolver,assertStandardSnapshotConsistency,normalizeWorkDate,businessError};