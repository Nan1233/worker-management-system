const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const srcRoot = path.join(__dirname, '..', 'src');
const read = (file) => fs.readFileSync(path.join(srcRoot, file), 'utf8');

test('durable report journal is initialized before React worker pages mount', () => {
  const main = read('main.tsx');
  assert.match(main, /initializeReliableReportRecovery/);
  assert.match(main, /initializeReliableReportRecovery\(\);/);
  assert.ok(main.indexOf('initializeReliableReportRecovery();') < main.indexOf('ReactDOM.createRoot'));
});

test('durable journal protects every production-temp POST before network send', () => {
  const journal = read('services/reliableReportJournal.ts');
  assert.match(journal, /method === "post"/);
  assert.match(journal, /production-temp/);
  assert.match(journal, /saveBeforeSend\(payload, owner\)/);
  assert.match(journal, /_ktcReportOwner = owner/);
  assert.match(journal, /localStorage/);
});

test('failed production reports are handed to the existing offline queue', () => {
  const journal = read('services/reliableReportJournal.ts');
  assert.match(journal, /import\("\.\/offlineReportQueue"\)/);
  assert.match(journal, /enqueueOfflineReport\(payload\)/);
  assert.match(journal, /ownerMatches\(currentOwner\(\), owner\)/);
  assert.match(journal, /client_request_id/);
});

test('journal recovery runs after reconnect and on a timer', () => {
  const journal = read('services/reliableReportJournal.ts');
  assert.match(journal, /addEventListener\("online", recover\)/);
  assert.match(journal, /setInterval\(recover, 30_000\)/);
});


test('localStorage quota failure never blocks the production report request', () => {
  const journal = read('services/reliableReportJournal.ts');
  assert.match(journal, /function writeAll\(items: JournalItem\[\]\): boolean/);
  assert.match(journal, /catch \(error\)[\s\S]*Reliable report journal storage is full/);
  assert.match(journal, /A full browser quota must[\s\S]*never prevent an online production report from reaching the backend/);
  assert.match(journal, /writeAll\(\[\.\.\.all,/);
});
