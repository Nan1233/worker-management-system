#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const gradlePath=path.join(root,'frontend','android','app','build.gradle');
const configPath=path.join(root,'frontend','capacitor.config.ts');
if(!fs.existsSync(gradlePath)) throw new Error(`Android Gradle project missing: ${gradlePath}`);
if(!fs.existsSync(configPath)) throw new Error(`Capacitor config missing: ${configPath}`);
const gradle=fs.readFileSync(gradlePath,'utf8');
const config=fs.readFileSync(configPath,'utf8');
for(const required of [
  'com.ktchanoi.productioncontrol',
  'KTC_ANDROID_KEYSTORE_PATH',
  'KTC_ANDROID_KEYSTORE_PASSWORD',
  'KTC_ANDROID_KEY_ALIAS',
  'KTC_ANDROID_KEY_PASSWORD',
  'KTC_ANDROID_REQUIRE_SIGNING'
]) {
  if(!gradle.includes(required)) throw new Error(`Android release contract missing: ${required}`);
}
if(!config.includes('com.ktchanoi.productioncontrol')) throw new Error('Capacitor appId mismatch');
if(!/versionCode\s+Integer\.parseInt\(System\.getenv\("KTC_ANDROID_VERSION_CODE"\)/.test(gradle)) throw new Error('Android versionCode must be environment-controlled');
if(!/versionName\s+System\.getenv\("KTC_ANDROID_VERSION_NAME"\)/.test(gradle)) throw new Error('Android versionName must be environment-controlled');
if(!/KTC_ANDROID_REQUIRE_SIGNING.*true/.test(gradle)) throw new Error('Android release signing guard missing');
console.log('KTC Android release contract OK');
console.log('Debug APK: npm --prefix frontend run android:apk:debug');
console.log('Release AAB: KTC_ANDROID_REQUIRE_SIGNING=true npm --prefix frontend run android:aab:release');
