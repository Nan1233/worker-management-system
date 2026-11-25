'use strict';
const fs=require('node:fs');
const path=require('node:path');
const packaged=typeof process.resourcesPath==='string'?path.join(process.resourcesPath,'shared','monthlyExcelContract.cjs'):null;
module.exports=require(packaged&&fs.existsSync(packaged)?packaged:'../../shared/monthlyExcelContract.cjs');
