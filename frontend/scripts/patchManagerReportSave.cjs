const fs = require("node:fs");
const path = require("node:path");

const managerFile = path.resolve(__dirname, "../src/pages/manager/ManagerReportGrid.tsx");
let managerSource = fs.readFileSync(managerFile, "utf8");

const old = 'const toolbarCancel=()=>{if(editing!=null)cancel(editing)};const toolbarSave=async()=>{if(editing==null){showToast("Chưa có dòng đang sửa");return}const r=rows.find(x=>Number(x.id)===editing);if(r)await save(r)};';
const replacement = 'const toolbarCancel=()=>{if(editing!=null)cancel(editing)};const toolbarSave=async()=>{if(saving)return;const ids=Object.keys(drafts).map(Number).filter(Number.isFinite);if(ids.length===0){showToast("Chưa có thay đổi để lưu");return}setSaving(true);try{for(const id of ids){const r=rows.find(x=>Number(x.id)===id);if(r)await save(r)} }finally{setSaving(false)}};';

if (managerSource.includes(replacement)) {
  console.log("[KTC] ManagerReportGrid Save patch already applied.");
} else {
  if (!managerSource.includes(old)) {
    throw new Error("Không tìm thấy toolbarSave hiện tại; dừng để tránh sửa sai file.");
  }
  managerSource = managerSource.replace(old, replacement);
  fs.writeFileSync(managerFile, managerSource, "utf8");
  console.log("[KTC] ManagerReportGrid: toolbar Lưu now saves all drafts sequentially.");
}

// Keep the KQD exclusion registry export available to ProcessPage.
// The test branch's processPageConfig.ts currently imports the registry but
// no longer exports KQD_CODES, while ProcessPage still consumes it.
const processConfigFile = path.resolve(__dirname, "../src/pages/worker/processPageConfig.ts");
let processConfigSource = fs.readFileSync(processConfigFile, "utf8");
const kqdExport = 'export const KQD_CODES = new Set(kqdExclusionRegistry.map((code) => String(code).trim().toUpperCase()));';

if (!processConfigSource.includes("export const KQD_CODES")) {
  processConfigSource = `${processConfigSource.trimEnd()}\n\n${kqdExport}\n`;
  fs.writeFileSync(processConfigFile, processConfigSource, "utf8");
  console.log("[KTC] processPageConfig: restored KQD_CODES export.");
} else {
  console.log("[KTC] processPageConfig: KQD_CODES export already present.");
}
