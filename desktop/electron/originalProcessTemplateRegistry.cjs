'use strict';

// Original company and Workbook1 process-specific template contracts.
const FORMS = Object.freeze({
  MAI: { file:"01_MAU_MAI.xlsx", sheet:"MÀI", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",H:"training",I:"workingTime",J:"actualTime",K:"deductionTime",AF:"product",AG:"standard",AH:"output",AI:"achievement",AK:"outputPerHour",AL:"ok",AM:"ng"}, deductions:["L","AE"], defects:["AN","AT"] },
  DO: { file:"02_MAU_DO.xlsx", sheet:"ĐO", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",G:"training",H:"workingTime",I:"actualTime",J:"deductionTime",AB:"product",AC:"standard",AD:"output",AE:"achievement",AG:"outputPerHour",AH:"ok",AI:"ngRate",AJ:"ng"}, deductions:["K","AA"], defects:["AK","AO"] },
  K1: { file:"03_MAU_KIEM_1.xlsx", sheet:"KIỂM 1", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",D:"product",F:"extra:press_date",G:"machine",H:"extra:press_box_shift",I:"deductionTime",J:"extra:deduction_work",K:"extra:late_early_hours",L:"extra:xlbv_deduction_worker",N:"actualTime",O:"expectedOutput",P:"output",Q:"achievement",S:"outputPerHour",T:"ok",U:"ng",V:"ngRate"}, defects:["W","BE"] },
  K2: { file:"04_MAU_KIEM_2.xlsx", sheet:"KIỂM 2", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",D:"training",E:"deductionTime",V:"workingTime",W:"actualTime",X:"product",Y:"standard",Z:"output",AA:"achievement",AC:"outputPerHour",AD:"ok",AE:"ng",AF:"ngRate"}, deductions:["F","T"], deductionHeader:2, defects:["AG","CE"] },
  CAN: { file:"05_MAU_CAN.xlsx", sheet:"CÁN", header:2, first:3, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",F:"actualTime",G:"product",H:"extra:material_code",I:"expectedOutput",J:"output",K:"achievement",M:"outputPerHour",N:"ngRate",O:"ng"}, defects:["P","S"] },
  EP: { file:"06_MAU_EP.xlsx", sheet:"ÉP", header:3, first:4, fields:{A:"stt",B:"workerCode",C:"workerName",D:"shift",E:"machine",F:"deductionTime",G:"actualTime",H:"product",I:"product",J:"standard",K:"output",L:"achievement",N:"outputPerHour",O:"ng",AF:"workingTime"}, deductions:["W","AE"], defects:["P","V"] },
  XLBV: { file:"07_MAU_XLBV.xlsx", sheet:"XLBV", header:4, first:5, fields:{A:"stt",B:"workerCode",C:"workerName",J:"ok",K:"actualTime",M:"product",O:"expectedOutput",P:"output",Q:"achievement",S:"outputPerHour",T:"ng",U:"ngRate"}, defects:["V","AI"] }
});
// Each process uses its own worksheet from the user-approved six-sheet workbook.
// Keep the original column positions, headings, styles and formulas.
const WORKBOOK1_FORMS = Object.freeze({
  GC: { file:"Workbook1.xlsx", sheet:"Gia công", header:3, first:5, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"training",F:"machine",G:"shift",H:"workingTime",I:"actualTime",J:"deductionTime",AA:"product",AB:"standard",AC:"output",AD:"achievement",AE:"date",AF:"ok",AG:"ng",AH:"ngRate"}, deductions:["K","Z"], defects:["AI","AZ"] },
  MAI: { file:"Workbook1.xlsx", sheet:"Mài", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",I:"training",J:"workingTime",K:"actualTime",L:"deductionTime",AG:"product",AH:"standard",AI:"output",AJ:"achievement",AK:"date",AL:"outputPerHour",AM:"ok",AN:"ng",AO:"ngRate"}, deductions:["M","AF"], defects:["AP","AV"] },
  DO: { file:"Workbook1.xlsx", sheet:"Đo", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",H:"training",I:"workingTime",J:"actualTime",K:"deductionTime",AC:"product",AD:"standard",AE:"output",AF:"achievement",AG:"date",AH:"outputPerHour",AI:"ok",AJ:"ng",AK:"ngRate"}, deductions:["L","AB"], defects:["AL","AW"] },
  XLBV: { file:"Workbook1.xlsx", sheet:"XLBV", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",H:"deductionTime",J:"training",K:"ok",L:"shift",M:"actualTime",N:"product",P:"expectedOutput",Q:"output",R:"achievement",S:"date",T:"outputPerHour",U:"ng",V:"ngRate"}, defects:["W","AI"] },
  EP: { file:"Workbook1.xlsx", sheet:"Ép", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",G:"deductionTime",H:"actualTime",I:"product",J:"product",K:"standard",L:"output",M:"achievement",N:"date",O:"outputPerHour",P:"ng",AG:"workingTime",AH:"note"}, deductions:["X","AF"], defects:["Q","W"] },
  CAN: { file:"Workbook1.xlsx", sheet:"Cán", header:1, first:3, fields:{A:"stt",B:"entryDate",C:"workerCode",D:"workerName",E:"shift",F:"machine",G:"actualTime",H:"extra:material_code",I:"product",J:"expectedOutput",K:"output",L:"achievement",M:"date",N:"outputPerHour",O:"ng",P:"ngRate",AA:"workingTime"}, deductions:["U","Z"], defects:["Q","T"] }
});

module.exports = { FORMS, WORKBOOK1_FORMS };
