import type { FormState } from "./processPageConfig";
export function clearZeroNumberField(form:FormState,name:string,value:string):FormState {
  return value==="0" ? {...form,[name]:""} : form;
}
export function updateTotalTimeField(form:FormState,value:string):FormState {
  return {...form,totalTime:value};
}
