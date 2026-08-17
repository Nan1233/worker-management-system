#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const config=fs.readFileSync(path.resolve(__dirname,'../capacitor.config.ts'),'utf8');
const readme=fs.readFileSync(path.resolve(__dirname,'../../docs/mobile/ios-android-release.md'),'utf8');
const required=['com.ktchanoi.productioncontrol','contentInset: "automatic"'];
for(const value of required) if(!config.includes(value)) throw new Error(`iOS config missing: ${value}`);
for(const value of ['npm run ios:add','npm run ios:sync','Apple Team','provisioning profile','TestFlight']) if(!readme.toLowerCase().includes(value.toLowerCase())) throw new Error(`iOS release documentation missing: ${value}`);
console.log('KTC iOS production setup contract OK');
