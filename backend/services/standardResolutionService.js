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
function normalizeRequestedWorkType({processId,processCode,machineWorkType,workType}){const explicit=normalizeWorkType(workType);if(explicit==='LONG')return 'Lồng';if(explicit==='CUT')return 'Cắt';const normalizedProcessCode=String(processCode||'').trim().toUpperCase();const isGc=normalizedProcessCode?normalizedProcessCode==='GC':Number(processId)===1;if(isGc)return machineWorkType||null;return null;}

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
  // Per-request lookup caches filled only by warmUp(). The shared runtime resolver never calls warmUp,
  // so long-lived isolates cannot serve stale machine/alias/standard rows from them.
  const warmMachines=new Map(), warmAliases=new Map(), warmMachineStandards=new Map();
  const warmStandards=new Map(), warmVersions=new Map();
  const sqlTrim=(value)=>String(value??'').replace(/^ +| +$/g,'');
  const machineLookupKey=(pid,id,code)=>`${pid}|${id||''}|${String(code||'').trim()}`;
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
    const warmedExact=warmStandards.get(`${pid}|${sqlTrim(product)}`);
    if(warmedExact){
      // Same filters as the SQL below (status, stored work type spellings, ORDER BY id LIMIT 2), applied in memory to the
      // rows warmUp() loaded for the whole report. An empty result is never trusted: it falls through to the SQL path.
      const allowedTypes=normalizedWorkType==='LONG'?['LỒNG','LONG']:normalizedWorkType==='CUT'?['CẮT','CAT','CUT']:null;
      const pick=warmedExact
        .filter(row=>(includeInactive||row.status==='active')&&(!allowedTypes||allowedTypes.includes(sqlTrim(row.work_type).toUpperCase())))
        .sort((x,y)=>Number(x.product_standard_id)-Number(y.product_standard_id)).slice(0,2)
        .map(({status,...rest})=>rest);
      if(pick.length)return pick;
    }
    const exactCodeRows=await query(`${fields} AND BINARY TRIM(product_code)=BINARY TRIM(?) ORDER BY id LIMIT 2`,[pid,product]);
    if(exactCodeRows.length)return exactCodeRows;
    const encodingRows=await query(`${fields} AND BINARY TRIM(encoding_code)=BINARY TRIM(?) ORDER BY id LIMIT 2`,[pid,product]);
    if(encodingRows.length)return encodingRows;
    // Resolve aliases only after exact product_code and encoding_code misses.
    // Multiple active canonical targets are a data conflict, never a tie-break.
    const aliasRows=await query(`SELECT DISTINCT product_code FROM product_aliases WHERE process_id=? AND status='active' AND BINARY TRIM(alias_code)=BINARY TRIM(?) ORDER BY product_code LIMIT 2`,[pid,product]);
    const aliasProducts=[...new Set(aliasRows.map(row=>normalizeCode(row?.product_code)).filter(Boolean))];
    if(aliasProducts.length>1)throw businessError('PRODUCT_ALIAS_CONFLICT',`Mã alias ${product} ánh xạ tới nhiều sản phẩm`,{process_id:pid,alias_code:product,product_codes:aliasProducts});
    if(!aliasRows.length){
      // Legacy master data can differ only by case (e.g. 15U vs 15u). Accept a case-insensitive
      // product_code only after exact code, encoding code and alias lookups miss; LIMIT 2 keeps
      // ambiguous standards fail-closed through selectProductRow().
      return query(`${fields} AND UPPER(TRIM(product_code))=UPPER(TRIM(?)) ORDER BY id LIMIT 2`,[pid,product]);
    }
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
    const warmVersionKey=`${pid}|${canonicalProduct}|${date}`;
    const versions=warmVersions.has(warmVersionKey)?warmVersions.get(warmVersionKey):await query(`SELECT id,process_id,product_code,standard_output,exclude_kqd_from_tt,version_no,effective_from,effective_to,status FROM product_standard_versions WHERE process_id=? AND product_code=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from,version_no,id`,[pid,canonicalProduct,date,date]);
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
    else if((requestedMachineId||requestedMachineCode)&&warmMachines.has(machineLookupKey(pid,requestedMachineId,requestedMachineCode)))machineRows=warmMachines.get(machineLookupKey(pid,requestedMachineId,requestedMachineCode));
    else if(requestedMachineId||requestedMachineCode)machineRows=await machineQuery(`SELECT m.id,m.machine_code,p.process_code FROM machines m JOIN processes p ON p.id=m.process_id WHERE m.process_id=? AND m.status='active' AND (? IS NULL OR m.id=?) AND (?='' OR UPPER(TRIM(m.machine_code))=UPPER(TRIM(?))) LIMIT 2`,[pid,requestedMachineId,requestedMachineId,requestedMachineCode,requestedMachineCode]);
    if(machineRows.length>1)throw businessError('MACHINE_NOT_FOUND','Máy xác định không duy nhất trong công đoạn');
    if((requestedMachineId||requestedMachineCode||requestedMachineStandardId)&&machineRows.length!==1)throw businessError('MACHINE_NOT_FOUND','Máy không tồn tại hoặc không thuộc công đoạn');
    const machine=machineRows[0]||null, processCode=String(machine?.process_code||'').trim().toUpperCase();
    const modeText=String(operationMode||executionMethod||'').trim().toUpperCase(), isAuto=['AUTO','AUTOMATIC','TỰ ĐỘNG','TU DONG'].includes(modeText)||/AUTO|TỰ\s*ĐỘNG|TU\s*DONG/.test(modeText);
    const inferredGcWorkType=gcWorkTypeLabel(machine?.gc_work_type);
    const isGcProcess=processCode?processCode==='GC':(pid===1&&(Boolean(inferredGcWorkType)||modeText==='MANUAL'||modeText==='MACHINE'));
    const explicitGcWorkType=normalizeWorkType(workType);
    const resolvedWorkType=normalizeRequestedWorkType({processId:pid,processCode,machineWorkType:inferredGcWorkType,workType});
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
    if(machine){const aliasWarmKey=`${pid}|${sqlTrim(requestedProduct)}`;const aliasRows=warmAliases.has(aliasWarmKey)?warmAliases.get(aliasWarmKey):await query(`SELECT DISTINCT product_code FROM product_aliases WHERE process_id=? AND status='active' AND BINARY TRIM(alias_code)=BINARY TRIM(?) ORDER BY product_code LIMIT 2`,[pid,requestedProduct]);const aliasProducts=[...new Set(aliasRows.map(row=>normalizeCode(row?.product_code)).filter(Boolean))];if(aliasProducts.length>1)throw businessError('PRODUCT_ALIAS_CONFLICT',`Mã alias ${requestedProduct} ánh xạ tới nhiều sản phẩm`,{process_id:pid,alias_code:requestedProduct,product_codes:aliasProducts});const canonicalMachineProduct=aliasRows[0]?.product_code?String(aliasRows[0].product_code).trim():requestedProduct;const machineStandardWarmKey=`${pid}|${Number(machine.id)}|${sqlTrim(canonicalMachineProduct)}|${date}`;const rows=warmMachineStandards.has(machineStandardWarmKey)?warmMachineStandards.get(machineStandardWarmKey):await query(`SELECT id,process_id,product_code,machine_id,standard_output,calculated_output_per_hour,standard_time_seconds,effective_from,effective_to,is_active FROM product_machine_standards WHERE process_id=? AND machine_id=? AND BINARY TRIM(product_code)=BINARY TRIM(?) AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>=?) ORDER BY COALESCE(effective_from,'1000-01-01') DESC,id DESC`,[pid,Number(machine.id),canonicalMachineProduct,date,date]);const active=rows.filter(r=>Number(r.is_active)===1),usable=active.length?active:rows;if(usable.length>1)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT',`Có nhiều định mức máy cùng hiệu lực cho ${requestedProduct} / ${machine.machine_code}`);if(!usable.length){
      // Legacy worker reports may store mode=MACHINE while the applicable machine standard
      // is named with an explicit -AUTO suffix. Try entered product and its AUTO variant
      // only after the canonical alias lookup found no usable machine standard.
      const fallbackCodes=[requestedProduct, /-AUTO$/i.test(requestedProduct)?requestedProduct:(requestedProduct+'-AUTO')];
      const fallbackRows=await query(`SELECT id,process_id,product_code,machine_id,standard_output,calculated_output_per_hour,standard_time_seconds,effective_from,effective_to,is_active FROM product_machine_standards WHERE process_id=? AND machine_id=? AND UPPER(TRIM(product_code)) IN (${fallbackCodes.map(()=>'?').join(',')}) AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>=?) ORDER BY COALESCE(effective_from,'1000-01-01') DESC,id DESC`,[pid,Number(machine.id),...fallbackCodes,date,date]);
      const fallbackActive=fallbackRows.filter(r=>Number(r.is_active)===1),fallbackUsable=fallbackActive.length?fallbackActive:fallbackRows;
      if(fallbackUsable.length>1)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT',`Có nhiều định mức máy cùng hiệu lực cho ${requestedProduct} / ${machine.machine_code}`);
      if(fallbackUsable.length===1)rows.push(...fallbackUsable);
    }
    const finalActive=rows.filter(r=>Number(r.is_active)===1),finalUsable=finalActive.length?finalActive:rows;
    if(finalUsable.length===1){const row=finalUsable[0],out=Number(row.calculated_output_per_hour??row.standard_output);if(Number.isFinite(out)&&out>0){const r={processId:pid,productCode:requestedProduct,productStandardId:null,standardVersionId:null,machineStandardId:Number(row.id),standardOutput:out,standardTimeSeconds:Number(row.standard_time_seconds)>0?Number(row.standard_time_seconds):null,excludeKqdFromTt:0,effectiveFrom:row.effective_from?String(row.effective_from).slice(0,10):null,effectiveTo:row.effective_to?String(row.effective_to).slice(0,10):null,source:Number(row.is_active)===1?'MACHINE':'MACHINE_HISTORICAL',workDate:date,historicalVersionAvailable:true,machineId:Number(machine.id),machineCode:machine.machine_code};standardCache.set(standardKey,r);return r;}}}
    const processAutoEligible=pid===1&&(isAuto||['AUTO','AUTOMATIC'].includes(String(workType||'').trim().toUpperCase()));
    const product=await resolveProduct({processId:pid,productCode:requestedProduct,workDate:date,standardVersionId:requestedVersionId,allowAutoAlias:processAutoEligible,workType:resolvedWorkType});
    const resolvedSource=product.nonProductWork?product.source:(machine?`${product.source}_MACHINE_FALLBACK`:`${product.source}_PROCESS_FALLBACK`);const resolved={...product,machineId:machine?Number(machine.id):null,machineCode:machine?machine.machine_code:null,machineStandardId:null,source:resolvedSource};standardCache.set(standardKey,resolved);return resolved;
  }
  // Batch the per-machine-line lookups (machine master, product aliases, machine standards) of one report
  // into three statements. resolveStandard() then reads them from memory; any key not warmed up still
  // falls back to its original per-line query, so results are identical, only the round trips change.
  async function warmUp({processId,workDate,items=[],machineRows=null}){
    const pid=Number(processId), date=normalizeWorkDate(workDate);
    const list=(items||[]).map((item)=>({machineId:Number(item?.machineId)||null,machineCode:String(item?.machineCode||'').trim(),productCode:String(item?.productCode||'').trim()}));
    if(!Number.isInteger(pid)||pid<=0||!list.length)return;
    // Always start from empty lookup maps: the resolver may be a long-lived singleton, and a key warmed by an
    // earlier request must never be served again. A concurrent warmUp only makes lookups fall back to SQL.
    warmMachines.clear();warmAliases.clear();warmMachineStandards.clear();warmStandards.clear();warmVersions.clear();
    const machineIds=[...new Set(list.map(i=>i.machineId).filter(Boolean))];
    const machineCodes=[...new Set(list.map(i=>i.machineCode.toUpperCase()).filter(Boolean))];
    const machineById=new Map();
    if(machineIds.length||machineCodes.length){
      const conditions=[],params=[pid];
      if(machineIds.length){conditions.push(`m.id IN (${machineIds.map(()=>'?').join(',')})`);params.push(...machineIds);}
      if(machineCodes.length){conditions.push(`UPPER(TRIM(m.machine_code)) IN (${machineCodes.map(()=>'?').join(',')})`);params.push(...machineCodes);}
      // `machineRows`: the caller already loaded the active machines of this process in this same request (same
      // columns, same status filter), so the lookup below is skipped.
      const rows=Array.isArray(machineRows)?machineRows:await queryWithOptionalGcWorkType(query,(withType)=>{const base=`SELECT m.id,m.machine_code,p.process_code FROM machines m JOIN processes p ON p.id=m.process_id WHERE m.process_id=? AND m.status='active' AND (${conditions.join(' OR ')})`;return withType?base.replace('SELECT m.id,m.machine_code,p.process_code','SELECT m.id,m.machine_code,m.gc_work_type,p.process_code'):base;},params);
      for(const item of list){
        if(!item.machineId&&!item.machineCode)continue;
        const matched=(rows||[]).filter(row=>(!item.machineId||Number(row.id)===item.machineId)&&(!item.machineCode||String(row.machine_code||'').trim().toUpperCase()===item.machineCode.toUpperCase())).slice(0,2);
        warmMachines.set(machineLookupKey(pid,item.machineId,item.machineCode),matched);
        if(matched.length===1)machineById.set(`${item.machineId||''}|${item.machineCode}`,matched[0]);
      }
    }
    const products=[...new Set(list.map(i=>sqlTrim(i.productCode)).filter(Boolean))];
    const canonicalByProduct=new Map();
    if(products.length){
      const aliasRows=await query(`SELECT DISTINCT alias_code, product_code FROM product_aliases WHERE process_id=? AND status='active' AND TRIM(alias_code) IN (${products.map(()=>'?').join(',')}) ORDER BY product_code`,[pid,...products]);
      for(const product of products){
        const rows=[],seen=new Set();
        for(const row of aliasRows||[]){if(sqlTrim(row.alias_code)!==product||seen.has(row.product_code))continue;seen.add(row.product_code);rows.push({product_code:row.product_code});}
        warmAliases.set(`${pid}|${product}`,rows.slice(0,2));
        canonicalByProduct.set(product,rows[0]?.product_code?String(rows[0].product_code).trim():product);
      }
    }
    // Product standards + effective versions of every product in the report in two statements instead of two per line.
    // Rows are kept per exact product code; anything not matched exactly (aliases, encoding codes, case variants) simply
    // misses the warm map and runs its original per-line SQL.
    const stdProducts=[...new Set([...products,...[...canonicalByProduct.values()].map(sqlTrim)].filter(Boolean))];
    if(stdProducts.length){
      const holders=stdProducts.map(()=>'?').join(',');
      const stdRows=await query(`SELECT id AS product_standard_id, product_code, encoding_code, work_type, standard_output, exclude_kqd_from_tt, status FROM product_standards ps WHERE process_id=? AND TRIM(product_code) IN (${holders})`,[pid,...stdProducts]);
      for(const code of stdProducts)warmStandards.set(`${pid}|${code}`,(stdRows||[]).filter(row=>sqlTrim(row.product_code)===code));
      const verRows=await query(`SELECT id,process_id,product_code,standard_output,exclude_kqd_from_tt,version_no,effective_from,effective_to,status FROM product_standard_versions WHERE process_id=? AND TRIM(product_code) IN (${holders}) AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from,version_no,id`,[pid,...stdProducts,date,date]);
      for(const code of stdProducts){
        const near=(verRows||[]).filter(row=>sqlTrim(row.product_code).toLowerCase()===code.toLowerCase());
        // a case/padding variant could match the per-line `product_code=?` differently: leave such products to SQL
        if(near.every(row=>String(row.product_code)===code))warmVersions.set(`${pid}|${code}|${date}`,near);
      }
    }
    const msPairs=[];
    for(const item of list){
      const machine=machineById.get(`${item.machineId||''}|${item.machineCode}`);
      if(!machine||!item.productCode)continue;
      msPairs.push({machineId:Number(machine.id),product:canonicalByProduct.get(sqlTrim(item.productCode))||item.productCode});
    }
    if(msPairs.length){
      const ids=[...new Set(msPairs.map(p=>p.machineId))],prods=[...new Set(msPairs.map(p=>sqlTrim(p.product)))];
      const rows=await query(`SELECT id,process_id,product_code,machine_id,standard_output,calculated_output_per_hour,standard_time_seconds,effective_from,effective_to,is_active FROM product_machine_standards WHERE process_id=? AND machine_id IN (${ids.map(()=>'?').join(',')}) AND TRIM(product_code) IN (${prods.map(()=>'?').join(',')}) AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>=?) ORDER BY COALESCE(effective_from,'1000-01-01') DESC,id DESC`,[pid,...ids,...prods,date,date]);
      for(const pair of msPairs){
        warmMachineStandards.set(`${pid}|${pair.machineId}|${sqlTrim(pair.product)}|${date}`,(rows||[]).filter(row=>Number(row.machine_id)===pair.machineId&&sqlTrim(row.product_code)===sqlTrim(pair.product)));
      }
    }
  }
  async function validateProductVersionRange({processId,productCode,effectiveFrom,effectiveTo=null,excludeVersionId=null}){const from=normalizeWorkDate(effectiveFrom),to=effectiveTo?normalizeWorkDate(effectiveTo):null;if(to&&to<from)throw businessError('INVALID_STANDARD_EFFECTIVE_RANGE','Ngày kết thúc định mức phải từ ngày bắt đầu trở đi');const rows=await query(`SELECT id FROM product_standard_versions WHERE process_id=? AND product_code=? AND status='active' AND (? IS NULL OR id<>?) AND effective_from<=COALESCE(?, '9999-12-31') AND (effective_to IS NULL OR effective_to>=?) LIMIT 2`,[Number(processId),String(productCode||'').trim(),excludeVersionId?Number(excludeVersionId):null,excludeVersionId?Number(excludeVersionId):null,to,from]);if(rows.length)throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT','Khoảng hiệu lực định mức bị chồng lấn',{conflicting_version_ids:rows.map(r=>Number(r.id))});return true;}
  return {resolveProduct,resolveStandard,validateProductVersionRange,warmUp};
}
function assertStandardSnapshotConsistency({resolved,standardOutput,standardVersionId,machineStandardId=null}){const savedOutput=Number(standardOutput),hasSavedOutput=Number.isFinite(savedOutput)&&savedOutput>0,outputMatches=Boolean(resolved)&&sameDecimal(resolved.standardOutput,standardOutput),versionMatches=Number(resolved?.standardVersionId||0)===Number(standardVersionId||0),machineMatches=Number(resolved?.machineStandardId||0)===Number(machineStandardId||0),hasMachineSnapshotId=Number(machineStandardId||0)>0,hasProductSnapshotId=Number(standardVersionId||0)>0;if(hasMachineSnapshotId&&(!outputMatches||!machineMatches||(hasProductSnapshotId&&!versionMatches)))throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử',{saved_standard_output:standardOutput??null,saved_standard_version_id:standardVersionId??null,saved_machine_standard_id:machineStandardId??null,expected_standard_output:resolved?.standardOutput??null,expected_standard_version_id:resolved?.standardVersionId??null,expected_machine_standard_id:resolved?.machineStandardId??null,expected_source:resolved?.source??null});if(hasProductSnapshotId&&!hasMachineSnapshotId){if(!hasSavedOutput||!outputMatches||!versionMatches)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}if(!hasProductSnapshotId&&!hasMachineSnapshotId){if(!hasSavedOutput)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}if(!resolved||!outputMatches||!versionMatches||!machineMatches)throw businessError('STANDARD_SNAPSHOT_MISMATCH','Định mức đã lưu không khớp nguồn định mức lịch sử');return true;}
const runtimeResolver=createStandardResolver();
module.exports={...runtimeResolver,createStandardResolver,assertStandardSnapshotConsistency,normalizeWorkDate,businessError};