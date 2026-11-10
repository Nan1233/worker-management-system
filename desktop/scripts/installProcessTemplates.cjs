"use strict";
// Usage: node scripts/installProcessTemplates.cjs "C:\path\KTC_Mau_Excel_Theo_Cong_Doan"
const fs=require("fs");
const path=require("path");
const {FORMS,TEMPLATE_ROOT}=require("../electron/originalProcessExcelTemplate.cjs");
const source=process.argv[2] && path.resolve(process.argv[2]);
if(!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()){
  console.error('Cách dùng: node scripts/installProcessTemplates.cjs "C:\\duong-dan\\KTC_Mau_Excel_Theo_Cong_Doan"');
  process.exit(1);
}
const missing=Object.values(FORMS).filter(f=>!fs.existsSync(path.join(source,f.file)));
if(missing.length){
  console.error("Thiếu file mẫu: "+missing.map(f=>f.file).join(", "));
  process.exit(1);
}
fs.mkdirSync(TEMPLATE_ROOT,{recursive:true});
for(const [code,form] of Object.entries(FORMS)){
  const from=path.join(source,form.file);
  const to=path.join(TEMPLATE_ROOT,form.file);
  const bytes=fs.readFileSync(from);
  if(bytes.subarray(0,2).toString()!=="PK") throw new Error("Không phải XLSX: "+from);
  if(fs.existsSync(to) && !process.argv.includes("--replace")){
    console.log("Đã tồn tại, giữ nguyên:",to);
    continue;
  }
  fs.writeFileSync(to,bytes);
  console.log(code, "=>",to,"("+bytes.length+" bytes)");
}
console.log("Hoàn tất cài mẫu. Khởi động lại Desktop để áp dụng.");
