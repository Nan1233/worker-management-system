'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('frontend machine event participant helper matches protected backend API contract', () => {
  const frontend = read('frontend/src/services/productionService.ts');
  const backendRoute = read('backend/routes/machineProductionEventRoutes.js');
  const backendController = read('backend/controllers/machineProductionEventController.js');
  const managerPanel = read('frontend/src/pages/manager/MachineEventPanel.tsx');

  const helper = frontend.split('\n').find((line) =>
    line.includes('export const linkMachineEventParticipants=')
  );
  assert.ok(helper, 'machine participant API helper is defined');

  // Link machine LINES, not worker IDs. Backend validates the referenced
  // machine lines against the physical event in a transaction.
  assert.match(helper, /\/link-participants`/);
  assert.match(helper, /temp_machine_line_ids:tempMachineLineIds/);
  assert.doesNotMatch(helper, /\/participants`|participant_ids:/);

  assert.match(
    backendRoute,
    /router\.post\('\/:id\/link-participants',auth,roles,permission\('REPORT_APPROVE'\),c\.link\)/
  );
  assert.match(
    backendController,
    /service\.linkParticipants\(\{id:Number\(req\.params\.id\),actor:actor\(req\),tempMachineLineIds:req\.body\?\.temp_machine_line_ids\|\|\[\],req\}\)/
  );
  assert.match(managerPanel, /\/link-participants`/);
  assert.match(managerPanel, /temp_machine_line_ids:/);
});
