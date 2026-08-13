#!/usr/bin/env node
const {spawnSync}=require('child_process'); const fs=require('fs'),path=require('path');
const patterns=['authorization','auth','session','security','rate-limit','idor','validation','concurrency','duplicate'];
const files=fs.readdirSync('backend/tests').filter(f=>f.endsWith('.test.js')&&patterns.some(p=>f.toLowerCase().includes(p))).map(f=>`tests/${f}`);
const r=spawnSync(process.execPath,['--test',...files],{cwd:'backend',stdio:'inherit',env:process.env}); process.exit(r.status||0);
