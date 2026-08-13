const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('manager search and pagination expose accessibility semantics',()=>{
  for(const f of ['src/pages/manager/Reports.tsx','src/pages/manager/ApprovedReports.tsx']){
    const s=read(f); assert.match(s,/aria-label="Tìm báo cáo/); assert.match(s,/<nav className="management-pagination" aria-label="Phân trang báo cáo">/); assert.match(s,/aria-label="Trang trước"/); assert.match(s,/aria-label="Trang sau"/); assert.match(s,/role="status"/);
  }
});
test('manager controls meet 44px touch target baseline',()=>{const s=read('src/pages/manager/Reports.css'); assert.match(s,/management-date-presets button \{ min-height: 44px/); assert.match(s,/management-pagination button \{ min-width: 44px; min-height: 44px/); assert.match(s,/management-filter-actions button \{ min-height: 44px/);});
test('worker mobile keeps apprentice percentage visible and responsive',()=>{const s=read('src/pages/worker/ProcessPage.css'); assert.doesNotMatch(s,/worker-sticky-training \{ display: none/); assert.match(s,/@media \(max-width:390px\).*worker-sticky-meta/s);});
test('worker action controls meet touch target and disabled readability contract',()=>{const s=read('src/pages/worker/ProcessPage.css'); assert.match(s,/worker-choice-row button \{\s*min-height: 44px/); assert.match(s,/duplicate-dialog-actions button \{ min-height: 44px/); assert.match(s,/worker-floating-save:disabled \{ background:/);});
test('worker dropdown surfaces use theme tokens instead of white overlays',()=>{const s=read('src/pages/worker/ProcessPage.css'); assert.match(s,/worker-dropdown-title .*background: var\(--ktc-surface-subtle\)/); assert.match(s,/worker-quality-card\.total-output .*background: var\(--ktc-surface-subtle\)/);});
test('reduced motion is honored on worker and manager pages',()=>{assert.match(read('src/pages/worker/ProcessPage.css'),/@media \(prefers-reduced-motion: reduce\)/); assert.match(read('src/pages/manager/Reports.css'),/@media \(prefers-reduced-motion: reduce\)/);});
