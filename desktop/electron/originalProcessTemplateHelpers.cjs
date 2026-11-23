'use strict';
const { cloneExcelStyle } = require('./excelStyleClone.cjs');

// Original process template style and defect mapping; preserve positional Excel contracts.
function createOriginalProcessTemplateHelpers({ norm }) {
function boundWorkbook1ConditionalFormats(sheet, firstDataRow, dataRows) {
  const originals = Array.isArray(sheet.conditionalFormattings)
    ? sheet.conditionalFormattings.slice() : [];
  const byColumn = new Map();
  for (const entry of originals) {
    for (const segment of String(entry.ref || "").split(/\s+/)) {
      const match = /^([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?$/.exec(segment);
      if (!match) continue;
      const [, beginCol, beginText, endCol = beginCol, endText = beginText] = match;
      if (beginCol !== endCol || Number(endText) < firstDataRow) continue;
      const previous = byColumn.get(beginCol);
      // Some company templates contain duplicated rules. Prefer the
      // complete palette rather than stacking conflicting duplicates.
      if (!previous || (entry.rules || []).length > previous.rules.length) {
        byColumn.set(beginCol, {
          startRow:Number(beginText),
          rules:entry.rules || []
        });
      }
    }
  }
  sheet.conditionalFormattings = [];
  const sorted = [...dataRows].sort((a,b) => a-b);
  const ranges = [];
  for (const row of sorted) {
    const current = ranges[ranges.length-1];
    if (current && current.end === row-1) current.end=row;
    else ranges.push({start:row,end:row});
  }
  for (const [column,original] of byColumn) {
    for (const range of ranges) {
      const rules = cloneExcelStyle(original.rules);
      const offset = range.start-original.startRow;
      for (const rule of rules) {
        if (rule.type !== "expression" || !Array.isArray(rule.formulae)) continue;
        rule.formulae = rule.formulae.map(formula => String(formula).replace(
          /(?<![A-Z0-9_])([A-Z]{1,3})(\d+)(?![A-Z0-9_])/g,
          (match,col,number) => {
            const target=Number(number)+offset;
            return target>0 ? col+target : match;
          }
        ));
      }
      sheet.addConditionalFormatting({
        ref:column+range.start+":"+column+range.end,
        rules
      });
    }
  }
}
// Shared with Gia công's monthly report rules in monthlyWorkbookLocal.cjs.
// >= 100% / <= 1% green; 90-<100% / >1-3% yellow; other orange-red.
const KTC_RATE_COLORS = Object.freeze({
  good:"FFC6E0B4", warning:"FFFFE699", bad:"FFFF5252"
});
const workbook1RateFill = (field,value) => {
  const n=Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  if (field === "achievement")
    return n >= 1 ? KTC_RATE_COLORS.good : n >= 0.9 ? KTC_RATE_COLORS.warning : KTC_RATE_COLORS.bad;
  if (field === "ngRate")
    return n <= 0.01 ? KTC_RATE_COLORS.good : n <= 0.03 ? KTC_RATE_COLORS.warning : KTC_RATE_COLORS.bad;
  return null;
};
const workbook1SolidFill = argb => ({
  type:"pattern", pattern:"solid", fgColor:{argb}
});
const defaultGridBorder = () => ({
  top:{style:"thin",color:{argb:"FF333333"}},
  bottom:{style:"thin",color:{argb:"FF333333"}},
  left:{style:"thin",color:{argb:"FF333333"}},
  right:{style:"thin",color:{argb:"FF333333"}}
});
const completeBorder = source => {
  const border=source ? cloneExcelStyle(source) : {};
  const fallback=defaultGridBorder();
  for (const edge of ["top","bottom","left","right"]) {
    if (!border[edge] || !border[edge].style) border[edge]=fallback[edge];
  }
  return border;
};
function matchMasterValue(header, types, values) {
  const name = norm(header);
  if (!name) return null;
  const matches = types.filter(item => [item.label, ...(item.aliases || [])].some(a => {
    if (String(a).startsWith("id:") || String(a).startsWith("code:")) return false;
    return norm(String(a).replace(/^name:/,"")) === name;
  }));
  if (matches.length !== 1) return null;
  return [matches[0].key,...(matches[0].aliases||[])].map(key=>values.get(key)).find(v=>v!==undefined) ?? null;
}
// FE and export receive the same per-process defect master data from the API.
// Resolve by stable ID/code first; names are only a fallback for legacy reports.
function masterAliases(item) {
  const keys=[];
  for(const value of [item?.defect_type_id,item?.type_id,item?.id]) {
    const n=Number(value);if(Number.isInteger(n)&&n>0)keys.push("id:"+n);
  }
  for(const value of [item?.defect_type_code,item?.defect_code,item?.type_code,item?.code]) {
    if(value!=null&&String(value).trim())keys.push("code:"+norm(value));
  }
  for(const value of [item?.defect_type_name,item?.defect_name,item?.type_name,item?.display_name,item?.label,item?.name]) {
    if(value!=null&&String(value).trim())keys.push("name:"+norm(value));
  }
  return [...new Set(keys)];
}
function defectDisplayName(item) {
  return String(item?.defect_type_name ?? item?.defect_name ?? item?.display_name ?? item?.type_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code ?? "").trim();
}
function makeDefectColumns(defectTypes,reports,helpers,code,slots) {
  const masters=Array.isArray(defectTypes)?defectTypes:[];
  const buckets=new Map();
  const canonical=(item)=>{
    const aliases=masterAliases(item);
    const matched=masters.find(master=>{
      const known=new Set([master.key,...(master.aliases||[])].map(String));
      return aliases.some(a=>known.has(a));
    });
    return matched || item;
  };
  for(let index=0;index<reports.length;index++){
    const details=helpers.reportDetailItems(reports[index],code,"defect");
    for(const item of details){
      const quantity=Number(item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value ?? 0);
      if(!Number.isFinite(quantity)||quantity<=0)continue;
      const master=canonical(item);
      const key=String(master.key || masterAliases(master)[0] || masterAliases(item)[0] || "name:"+norm(defectDisplayName(item)));
      if(!key||key==="name:")throw new Error("Không xác định được loại NG của "+code+" tại báo cáo "+(index+1));
      let entry=buckets.get(key);
      if(!entry){entry={key,label:String(master.label || defectDisplayName(master) || defectDisplayName(item) || key),values:new Map()};buckets.set(key,entry);}
      entry.values.set(index,(entry.values.get(index)||0)+quantity);
    }
  }
  if(buckets.size>slots.length)throw new Error("Mẫu "+code+" chỉ có "+slots.length+" cột NG nhưng dữ liệu cần "+buckets.size+" cột; không thể xuất mà không mất dữ liệu.");
  return [...buckets.values()];
}

return {
  boundWorkbook1ConditionalFormats, workbook1RateFill, workbook1SolidFill,
  completeBorder, matchMasterValue, masterAliases, defectDisplayName, makeDefectColumns,
};
}
module.exports = { createOriginalProcessTemplateHelpers };
