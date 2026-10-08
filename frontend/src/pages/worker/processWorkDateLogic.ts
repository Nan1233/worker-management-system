export function validateWorkerWorkDate(value:string,minDate:string,maxDate:string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Ngày làm việc không hợp lệ";
  if (value < minDate || value > maxDate) return `Chỉ được nhập từ ${minDate} đến ${maxDate}`;
  return "";
}
