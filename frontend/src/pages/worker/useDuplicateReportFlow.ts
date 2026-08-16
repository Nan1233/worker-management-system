import { useState } from "react";
import { createTempReport, updateTempReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import type { DuplicatePromptState } from "./processDuplicateReportLogic";

export function useDuplicateReportFlow(args:{
  setSubmitting:(v:boolean)=>void;
  showToast:(message:string,type?:any)=>void;
  navigateToWorker:()=>void;
  resetClientRequestId:()=>void;
  releaseSubmitLock:()=>void;
}) {
  const [duplicatePrompt,setDuplicatePrompt]=useState<DuplicatePromptState|null>(null);
  const finish=()=>{setDuplicatePrompt(null);args.resetClientRequestId();args.releaseSubmitLock();args.setSubmitting(false);args.navigateToWorker();};
  const handleCreateDuplicateAnyway=async()=>{
    if(!duplicatePrompt)return;
    try {
      args.setSubmitting(true);
      await createTempReport({...duplicatePrompt.payload,force_create:true,duplicate_confirmation_token:duplicatePrompt.confirmationToken});
      args.showToast("Đã tạo báo cáo trùng theo xác nhận.","success"); finish();
    } catch(e:any) { args.showToast(e?.response?.data?.message||"Không thể tạo báo cáo.","error"); args.releaseSubmitLock(); args.setSubmitting(false); }
  };
  const handleUpdateExistingReport=async()=>{
    if(!duplicatePrompt || duplicatePrompt.reportType==="approved")return;
    try {
      args.setSubmitting(true);
      await updateTempReport(duplicatePrompt.reportId,{...duplicatePrompt.payload,id:duplicatePrompt.reportId});
      args.showToast("Đã cập nhật báo cáo hiện có.","success"); finish();
    } catch(e:any) { args.showToast(e?.response?.data?.message||"Không thể cập nhật báo cáo.","error"); args.releaseSubmitLock(); args.setSubmitting(false); }
  };
  return {duplicatePrompt,setDuplicatePrompt,handleCreateDuplicateAnyway,handleUpdateExistingReport};
}
