#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const configPath=path.join(root,'frontend','capacitor.config.ts');
const readmePath=path.join(root,'docs','mobile','ios-android-release.md');
if(!fs.existsSync(configPath)) throw new Error('frontend/capacitor.config.ts missing');
if(!fs.existsSync(readmePath)) throw new Error('iOS release documentation missing');
const config=fs.readFileSync(configPath,'utf8');
const readme=fs.readFileSync(readmePath,'utf8');
for(const value of ['com.ktchanoi.productioncontrol','contentInset: "automatic"']) {
  if(!config.includes(value)) throw new Error(`iOS config missing: ${value}`);
}
for(const value of ['ios:add','ios:sync','Apple Team','provisioning profile','TestFlight','macOS','Xcode']) {
  if(!readme.toLowerCase().includes(value.toLowerCase())) throw new Error(`iOS release documentation missing: ${value}`);
}
console.log('KTC iOS production setup contract OK (source/docs validation; native signing requires macOS/Xcode)');
