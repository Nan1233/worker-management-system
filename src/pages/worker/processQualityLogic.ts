import type { FormState } from "./processPageConfig";

type NgOption={key:string;code?:string|null};
export function isValidIntegerInput(value:string): boolean { return /^\d*$/.test(String(value??"")); }
export function calculateNgTotal(form:FormState, options:NgOption[]): number {
  return (options||[]).reduce((sum,o)=>sum+(Number(form[o.key])||0),0);
}
export function applyNgToggleToForm(form:FormState,key:string,checked:boolean,options:NgOption[],calc:(f:FormState)=>number):FormState {
  const next={...form,[key]:checked ? (form[key] || "0") : ""};
  // TT NG is the sum of NG defect quantities only.
  // Total/actual output is a separate value: TT OK + counted NG.
  next.ttNg=String(calculateNgTotal(next, options));
  next.actualOutput=String(calc(next));
  return next;
}
export function applyNgValueToForm(form:FormState,key:string,value:string,options:NgOption[],calc:(f:FormState)=>number):FormState {
  const next={...form,[key]:value};
  // Never use actualOutput (TT OK + NG) as TT NG.
  next.ttNg=String(calculateNgTotal(next, options));
  next.actualOutput=String(calc(next));
  return next;
}
export function applyTtOkToForm(form:FormState,value:string,calc:(f:FormState)=>number):FormState {
  const next={...form,ttOk:value}; next.actualOutput=String(calc(next)); return next;
}
