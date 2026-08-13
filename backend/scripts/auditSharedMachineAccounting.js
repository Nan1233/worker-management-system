'use strict';
const {scan}=require('../services/sharedMachineAccountingAuditService');
(async()=>{try{const findings=await scan();console.log(JSON.stringify({success:true,read_only:true,count:findings.length,findings},null,2));process.exitCode=0;}catch(error){console.error(JSON.stringify({success:false,read_only:true,message:error.message},null,2));process.exitCode=1;}})();
