#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8'));const expected={uuid:'11.1.1',tmp:'0.2.6'};
for(const [name,version] of Object.entries(expected))if(pkg.overrides?.[name]!==version)throw new Error(`Missing non-breaking audit override ${name}@${version}`);
console.log('KTC non-breaking audit remediation contract PASS');console.log(JSON.stringify({overrides:pkg.overrides},null,2));
