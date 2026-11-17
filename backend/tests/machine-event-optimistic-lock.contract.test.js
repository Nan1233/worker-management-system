'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../services/machineProductionEventService.js'), 'utf8');

test('event edit locks the current row before checking client version', () => {
  const edit = source.slice(source.indexOf('async function updateEvent('), source.indexOf('async function linkParticipants('));
  assert.match(edit, /loadEvent\(connection, id, \{lock:true\}\)/);
  assert.match(edit, /assertExpectedEventVersion\(before, patch\?\.expected_updated_at\)/);
  assert.ok(edit.indexOf('assertExpectedEventVersion(') < edit.indexOf('UPDATE machine_production_events'));
  assert.match(edit, /await connection\.rollback\(\)\.catch/);
});

test('missing and stale event version reject with HTTP 409', () => {
  assert.match(source, /eventError\(409, 'MACHINE_EVENT_VERSION_REQUIRED'/);
  assert.match(source, /eventError\(409, 'MACHINE_EVENT_VERSION_CONFLICT'/);
  assert.match(source, /!Number\.isFinite\(expected\) \|\| !Number\.isFinite\(current\) \|\| expected !== current/);
});

test('event physical updates and defect replacement remain in one transaction', () => {
  const edit = source.slice(source.indexOf('async function updateEvent('), source.indexOf('async function linkParticipants('));
  assert.match(edit, /await connection\.beginTransaction\(\)/);
  assert.match(edit, /UPDATE machine_production_events/);
  assert.match(edit, /DELETE FROM machine_production_event_defects/);
  assert.match(edit, /await connection\.commit\(\)/);
});
