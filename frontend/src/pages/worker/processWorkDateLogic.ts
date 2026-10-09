export function validateWorkerWorkDate(value:string,minDate:string,maxDate:string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Ngày làm việc không hợp lệ";
  if (value < minDate || value > maxDate) return `Chỉ được nhập từ ${minDate} đến ${maxDate}`;
  return "";
}
export function resolveWorkDateForShiftChange(args:{currentWorkDate:string;previousShift:string;nextShift:string;shiftDate:(d:string,o:number)=>string;clampDate:(d:string)=>string}):string {
  if (!args.currentWorkDate) return args.clampDate(args.currentWorkDate);
  const prev=String(args.previousShift||"").toUpperCase(), next=String(args.nextShift||"").toUpperCase();
  let date=args.currentWorkDate;
  if (prev!==next && next==="C") date=args.shiftDate(date,-1);
  else if (prev==="C" && next!=="C") date=args.shiftDate(date,1);
  return args.clampDate(date);
}
