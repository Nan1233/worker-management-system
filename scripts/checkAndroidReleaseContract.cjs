#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const gradle=fs.readFileSync(path.resolve(__dirname,'../android/app/build.gradle'),'utf8');
const config=fs.readFileSync(path.resolve(__dirname,'../capacitor.config.ts'),'utf8');
for(const required of ['com.ktchanoi.productioncontrol','KTC_ANDROID_KEYSTORE_PATH','KTC_ANDROID_KEYSTORE_PASSWORD','KTC_ANDROID_KEY_ALIAS','KTC_ANDROID_KEY_PASSWORD','KTC_ANDROID_REQUIRE_SIGNING']) {
  if(!gradle.includes(required)) throw new Error(`Android release contract missing: ${required}`);
}
if(!config.includes('com.ktchanoi.productioncontrol')) throw new Error('Capacitor appId mismatch');
console.log('KTC Android release contract OK');
console.log('Debug APK: npm run android:apk:debug');
console.log('Release AAB: KTC_ANDROID_REQUIRE_SIGNING=true npm run android:aab:release');
