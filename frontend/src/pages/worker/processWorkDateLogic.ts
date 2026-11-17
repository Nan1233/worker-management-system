export function validateWorkerWorkDate(
  value: string,
  minDate: string,
  maxDate: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Ngày làm việc không hợp lệ";
  }

  if (value < minDate || value > maxDate) {
    return `Chỉ được nhập từ ${minDate} đến ${maxDate}`;
  }

  return "";
}

type ShiftDateChange = {
  currentWorkDate: string;
  previousShift: string;
  nextShift: string;
  shiftDate: (date: string, offset: number) => string;
  clampDate: (date: string) => string;
};

export function resolveWorkDateForShiftChange({
  currentWorkDate,
  previousShift,
  nextShift,
  shiftDate,
  clampDate,
}: ShiftDateChange): string {
  if (!currentWorkDate) {
    return clampDate(currentWorkDate);
  }

  const previous = String(previousShift || "").toUpperCase();
  const next = String(nextShift || "").toUpperCase();
  let date = currentWorkDate;

  if (previous !== next && next === "C") {
    date = shiftDate(date, -1);
  } else if (previous === "C" && next !== "C") {
    date = shiftDate(date, 1);
  }

  return clampDate(date);
}
