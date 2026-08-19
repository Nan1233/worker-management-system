#!/usr/bin/env node
const mysql=require('../../backend/node_modules/mysql2/promise');
const bcrypt=require('../../backend/node_modules/bcrypt');
const fs=require('fs');
const path=require('path');
const cfg={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME};
const OUT=path.resolve(process.env.KTC_VALIDATION_DIR||'validation-artifacts','fixture.json');
const ids={GC:1,MAI:2,K1:3,K2:4,DO:60001,CAN:60002,EP:60003,XLBV:60004,SX3:60005};
const procNames={GC:'Cắt/Lồng',MAI:'Mài',K1:'Kiểm 1',K2:'Kiểm 2',DO:'Đo',CAN:'Cán',EP:'Ép',XLBV:'Xử lý Bavia',SX3:'Sản xuất 3'};
const machines={GC:['5','6','7','11','1'],MAI:['MAI-1','MAI-2','MAI-3','MAI-4'],K1:['K1-1'],K2:['K2-1'],DO:['DO-1'],CAN:['CAN-1'],EP:['EP-1']};
async function main(){
 if(process.env.KTC_RUNTIME_ENV_CLASS!=='STAGING'||process.env.DB_NAME!=='worker_management_staging_local'||!['127.0.0.1','localhost'].includes(process.env.DB_HOST)) throw new Error('UNSAFE_LOCAL_TARGET');
 const db=await mysql.createConnection(cfg); const today=new Date().toISOString().slice(0,10);
 for(const [code,id] of Object.entries(ids)) await db.execute(`INSERT INTO processes(id,process_code,process_name,status) VALUES(?,?,?,'active') ON DUPLICATE KEY UPDATE process_name=VALUES(process_name),status='active'`,[id,code,procNames[code]]);
 const workerUser='ktc_e2e_worker', managerUser='ktc_e2e_manager', workerCode='KTC_E2E_WORKER', managerPassword='KtcE2E-Local-Only-2026!';
 const hash=await bcrypt.hash(managerPassword,10);
 await db.execute(`INSERT INTO users(username,password,full_name,role,status) VALUES(?,?,'KTC E2E Worker','worker','active') ON DUPLICATE KEY UPDATE status='active'`,[workerUser,hash]);
 await db.execute(`INSERT INTO users(username,password,full_name,role,status) VALUES(?,?,'KTC E2E Manager','manager','active') ON DUPLICATE KEY UPDATE password=VALUES(password),status='active'`,[managerUser,hash]);
 const [[wu]]=await db.execute(`SELECT id FROM users WHERE username=?`,[workerUser]); const [[mu]]=await db.execute(`SELECT id FROM users WHERE username=?`,[managerUser]);
 await db.execute(`INSERT INTO workers(user_id,worker_code,training_percent,status) VALUES(?,?,100,'active') ON DUPLICATE KEY UPDATE worker_code=VALUES(worker_code),status='active'`,[wu.id,workerCode]);
 const [[w]]=await db.execute(`SELECT id FROM workers WHERE user_id=?`,[wu.id]);
 for(const id of Object.values(ids)) await db.execute(`INSERT IGNORE INTO worker_processes(worker_id,process_id) VALUES(?,?)`,[w.id,id]);
 for(const id of [ids.GC,ids.MAI,ids.K1,ids.K2,ids.DO,ids.CAN,ids.EP]) await db.execute(`INSERT IGNORE INTO manager_processes(manager_id,process_id) VALUES(?,?)`,[mu.id,id]);
 for(const [code,list] of Object.entries(machines)) for(const m of list){
   const auto=code==='GC'&&['5','6','7','11','1'].includes(m)?1:0; const max=code==='GC'&&['5','6','7','11'].includes(m)?4:1; const basis=code==='GC'&&auto?'MACHINE':'PRODUCT';
   await db.execute(`INSERT INTO machines(process_id,machine_code,machine_name,exclude_kqd_from_tt,status,is_automatic,max_workers_per_machine,output_basis) VALUES(?,?,?,?, 'active',?,?,?) ON DUPLICATE KEY UPDATE status='active',is_automatic=VALUES(is_automatic),max_workers_per_machine=VALUES(max_workers_per_machine),output_basis=VALUES(output_basis)`,[ids[code],m,`E2E ${m}`,code==='GC'?1:0,auto,max,basis]);
 }
 const fixture={worker:{username:workerUser,code:workerCode},manager:{username:managerUser,password:managerPassword},processes:{},date:today};
 for(const [code,pid] of Object.entries(ids)){
   const product=`E2E_${code}`; const exclude=code==='GC'?1:0;
   await db.execute(`INSERT INTO product_standards(process_id,work_type,product_code,standard_output,exclude_kqd_from_tt,status) VALUES(?, '', ?,100,?,'active') ON DUPLICATE KEY UPDATE standard_output=100,exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt),status='active'`,[pid,product,exclude]);
   const [[ps]]=await db.execute(`SELECT id FROM product_standards WHERE process_id=? AND product_code=?`,[pid,product]);
   await db.execute(`INSERT INTO product_standard_versions(process_id,product_code,standard_output,exclude_kqd_from_tt,version_no,effective_from,effective_to,status) SELECT ?,?,100,?,1,'2020-01-01',NULL,'active' WHERE NOT EXISTS (SELECT 1 FROM product_standard_versions WHERE process_id=? AND product_code=? AND status='active')`,[pid,product,exclude,pid,product]);
   const machineRows=[];
   for(const m of (machines[code]||[])){
     const [[mr]]=await db.execute(`SELECT id FROM machines WHERE process_id=? AND machine_code=?`,[pid,m]); machineRows.push({code:m,id:mr.id});
     await db.execute(`INSERT INTO product_machine_standards(process_id,product_code,machine_id,standard_output,calculated_output_per_hour,effective_from,effective_to,is_active) SELECT ?,?,?,100,100,'2020-01-01',NULL,1 WHERE NOT EXISTS (SELECT 1 FROM product_machine_standards WHERE process_id=? AND product_code=? AND machine_id=? AND is_active=1)`,[pid,product,mr.id,pid,product,mr.id]);
   }
   await db.execute(`INSERT INTO defect_types(process_id,defect_code,defect_name,status) VALUES(?, 'KQD','KQD','active') ON DUPLICATE KEY UPDATE status='active'`,[pid]);
   await db.execute(`INSERT INTO defect_types(process_id,defect_code,defect_name,status) VALUES(?, 'KQD_TEST','KQD TEST','active') ON DUPLICATE KEY UPDATE status='active'`,[pid]);
   const [defs]=await db.execute(`SELECT id,defect_code FROM defect_types WHERE process_id=? AND defect_code IN ('KQD','KQD_TEST')`,[pid]);
   fixture.processes[code]={id:pid,product,productStandardId:ps.id,machines:machineRows,defects:Object.fromEntries(defs.map(x=>[x.defect_code,x.id]))};
 }
 fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT,JSON.stringify(fixture,null,2));
 console.log(`KTC_ZERO_COST_FIXTURE=${OUT}`); console.log(`TEST_WORKER_CODE=${workerCode}`); console.log(`TEST_MANAGER_USER=${managerUser}`); console.log('TEST_MANAGER_PASSWORD=<generated-local-only>'); await db.end();
}
main().catch(e=>{console.error('KTC_ZERO_COST_SEED_FAIL',e.code||e.message);process.exit(1)});
