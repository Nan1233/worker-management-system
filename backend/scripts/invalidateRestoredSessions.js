'use strict';
const db=require('../config/db');
async function main(){ await db.testConnection(); const [result]=await db.promise().query(`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE revoked_at IS NULL`); const [rows]=await db.promise().query('SELECT COUNT(*) AS n FROM user_sessions WHERE revoked_at IS NULL'); if(Number(rows[0]?.n||0)!==0) throw Object.assign(new Error('Active restored sessions remain'),{code:'RESTORED_SESSION_INVALIDATION_FAILED'}); console.log(JSON.stringify({success:true,policy:'REVOKE_ALL_RESTORED_SESSIONS',affected:Number(result.affectedRows||0),active_remaining:0},null,2)); }
main().catch((e)=>{console.error(`[KTC][F16] Session invalidation failed: ${e.code||e.message}`);process.exitCode=1;}).finally(()=>db.closePool().catch(()=>{}));
