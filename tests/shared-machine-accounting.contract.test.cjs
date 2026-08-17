const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');

test('manager/lead report detail exposes physical-event management without worker physical controls',()=>{
  const detail=read('src/pages/manager/ReportDetail.tsx');
  const panel=read('src/pages/manager/MachineEventPanel.tsx');
  assert.match(detail,/MachineEventPanel/);
  assert.match(panel,/Physical machine event/);
  assert.match(panel,/credited output/);
  assert.match(panel,/Tạo event từ dòng này/);
  assert.match(panel,/Duyệt event/);
  assert.match(panel,/Lưu physical truth/);
  assert.match(panel,/source === "pending"/);
  assert.match(panel,/Legacy approved line chưa có physical event/);
  assert.match(panel,/responsible_worker_id/);
});

test('worker shared-machine wording distinguishes credited output from physical machine truth',()=>{
  const source=read('src/pages/worker/components/ProcessBasicInfoSection.tsx');
  assert.match(source,/Shared machine:/);
  assert.match(source,/sản lượng được credit/);
  assert.match(source,/production event riêng/);
});

test('frontend event API separates event physical truth from report service',()=>{
  const source=read('src/services/productionService.ts');
  assert.match(source,/createMachineProductionEvent/);
  assert.match(source,/linkMachineEventParticipants/);
  assert.match(source,/approveMachineProductionEvent/);
  assert.match(source,/physical_counted_output/);
  assert.match(source,/credited_output/);
});
