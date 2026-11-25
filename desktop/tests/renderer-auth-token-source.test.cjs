'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const {createRendererAuthClient} = require('../electron/rendererAuthClient.cjs');
const loadReader = context => createRendererAuthClient({getWindow:()=>context.mainWindow,normalizeAccessToken:context.normalizeAccessToken}).readRendererAccessToken;

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
  const load = loadReader(context);
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
  const load=loadReader(context);
  assert.equal(await load(),'LEGACY_NATIVE_ACCESS_TOKEN');
});
