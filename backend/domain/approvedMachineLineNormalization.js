'use strict';

function normalizeApprovedMachineLines({ report, machineLines, persistedMachineDefects, persistedEventDefects }) {
    const eventDefectsByEvent=new Map();
    for(const defect of persistedEventDefects){
      const key=Number(defect.machine_event_id);
      if(!eventDefectsByEvent.has(key))eventDefectsByEvent.set(key,[]);
      eventDefectsByEvent.get(key).push({
        id:defect.id,
        defect_type_id:defect.defect_type_id,
        defect_code:defect.defect_code,
        defect_name:defect.defect_name,
        quantity:defect.quantity,
        responsible_worker_id:defect.responsible_worker_id
      });
    }

    const machineDefectsByLine=new Map();
    for(const defect of persistedMachineDefects){
      const key=Number(defect.machine_line_id);
      if(!machineDefectsByLine.has(key))machineDefectsByLine.set(key,[]);
      machineDefectsByLine.get(key).push({
        id:defect.id,
        defect_type_id:defect.defect_type_id,
        defect_code:defect.defect_code,
        defect_name:defect.defect_name,
        quantity:defect.quantity
      });
    }

    const normalizedMachineLines=machineLines.map(line=>{
      const persisted=machineDefectsByLine.get(Number(line.id))||[];
      if(persisted.length)return {...line,defects:persisted,defects_json:JSON.stringify(persisted)};

      const existingFromLine=(()=>{
        let parsed=line?.defects;
        if(!Array.isArray(parsed))parsed=line?.defects_json;
        if(typeof parsed==='string'){
          try{parsed=JSON.parse(parsed);}catch{parsed=null;}
        }
        if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Array.isArray(parsed.defects))parsed=parsed.defects;
        return Array.isArray(parsed)?parsed.filter(item=>Number(item?.quantity||0)>0):[];
      })();
      if(existingFromLine.length)return {...line,defects:existingFromLine,defects_json:JSON.stringify(existingFromLine)};

      const eventDetails=(eventDefectsByEvent.get(Number(line.machine_event_id))||[]).filter(defect=>defect.responsible_worker_id != null && Number(defect.responsible_worker_id)===Number(report.worker_id));
      if(eventDetails.length)return {...line,defects:eventDetails,defects_json:JSON.stringify(eventDetails)};
      return {...line,defects:[]};
    });

    return normalizedMachineLines;
}
module.exports = { normalizeApprovedMachineLines };
