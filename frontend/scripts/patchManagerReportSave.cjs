const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../src/pages/manager/ManagerReportGrid.tsx");
let source = fs.readFileSync(file, "utf8");

const old = 'const toolbarCancel=()=>{if(editing!=null)cancel(editing)};const toolbarSave=async()=>{if(editing==null){showToast("Chưa có dòng đang sửa");return}const r=rows.find(x=>Number(x.id)===editing);if(r)await save(r)};';
const replacement = 'const toolbarCancel=()=>{if(editing!=null)cancel(editing)};const toolbarSave=async()=>{if(saving)return;const ids=Object.keys(drafts).map(Number).filter(Number.isFinite);if(ids.length===0){showToast("Chưa có thay đổi để lưu");return}setSaving(true);try{let failed=0;for(const id of ids){const r=rows.find(x=>Number(x.id)===id);if(!r)continue;try{await save(r)}catch{failed+=1}}if(failed===0)showToast("Đã lưu tất cả thay đổi","success");}finally{setSaving(false)}};';

if (!source.includes(old)) {
  throw new Error("Không tìm thấy toolbarSave hiện tại; dừng để tránh sửa sai file.");
}
source = source.replace(old, replacement);
fs.writeFileSync(file, source, "utf8");
console.log("[KTC] ManagerReportGrid: toolbar Lưu now saves all drafts sequentially.");
