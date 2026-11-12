'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname,'../electron/main.cjs'),'utf8');
const beginning = source.indexOf('async function readRendererAccessToken() {');
const ending = source.indexOf('\nasync function resolveDesktopToken(',beginning);
assert.ok(beginning > -1 && ending > beginning,'Desktop reader must exist');
const fnSource = source.slice(beginning,ending);

test('Electron reads hosted frontend sessionStorage first and falls back to localStorage',async () => {
  let rendererScript='';
  const context = {
    mainWindow: {
      isDestroyed: () => false,
      webContents:{
        isDestroyed:()=>false,
        executeJavaScript:async script=>{rendererScript=script;return vm.runInNewContext(script,{
          sessionStorage:{getItem:key=>key==='accessToken'?'SESSION_ACCESS_TOKEN':null},
          localStorage:{getItem:key=>key==='accessToken'?'STALE_LOCAL_ACCESS_TOKEN':null}
        });}
      }
    },
    normalizeAccessToken:token=>String(token||'').trim()
  };
  const load = vm.runInNewContext(fnSource+'\nreadRendererAccessToken',context);
  assert.equal(await load(),'SESSION_ACCESS_TOKEN');
  assert.match(rendererScript,/sessionStorage/);
  assert.match(rendererScript,/localStorage/);
});

test('Electron still reads legacy native localStorage when sessionStorage is empty',async () => {
  const context = {
    mainWindow:{
      isDestroyed:()=>false,
      webContents:{
        isDestroyed:()=>false,
        executeJavaScript:async script=>vm.runInNewContext(script,{
          sessionStorage:{getItem:()=>null},
          localStorage:{getItem:key=>key==='token'?'LEGACY_NATIVE_ACCESS_TOKEN':null}
        })
      }
    },
    normalizeAccessToken:token=>String(token||'').trim()
  };
  const load=vm.runInNewContext(fnSource+'\nreadRendererAccessToken',context);
  assert.equal(await load(),'LEGACY_NATIVE_ACCESS_TOKEN');
});
