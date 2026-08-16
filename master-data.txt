import { useEffect, useState } from "react";
import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import { getCachedMachines, getCachedProductStandards, getCachedDefects, getCachedDeductions } from "../../services/masterDataCache";

export function useProcessMasterData(processId:number, processCode:string) {
  const [machineOptions,setMachineOptions]=useState<MachineOption[]>([]);
  const [productOptions,setProductOptions]=useState<ProductStandardOption[]>([]);
  const [activeNgOptions,setActiveNgOptions]=useState<any[]>([]);
  const [activeDeductionOptions,setActiveDeductionOptions]=useState<any[]>([]);
  const [loadingMasterData,setLoading]=useState(true);
  useEffect(()=>{
    let alive=true; setLoading(true);
    Promise.all([
      getCachedMachines(processId),
      getCachedProductStandards(processId,processCode),
      getCachedDefects(processId),
      getCachedDeductions(processId)
    ]).then(([machines,products,defects,deductions])=>{
      if(!alive)return;
      setMachineOptions(machines); setProductOptions(products); setActiveNgOptions(defects as any[]); setActiveDeductionOptions(deductions as any[]);
    }).catch(()=>{}).finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[processId,processCode]);
  return {machineOptions,productOptions,activeNgOptions,activeDeductionOptions,loadingMasterData};
}
