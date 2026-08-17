export const decimalHoursToMinutes = (value?: number | string | null): number => {
  const hours = Number(value ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
};

export const formatMinutes = (value?: number | string | null): string =>
  `${decimalHoursToMinutes(value).toLocaleString("vi-VN")} phút`;

export const sumDeductionMinutes = (
  items?: Array<{ hours?: number | string | null }> | null
): number => (items || []).reduce((total, item) => total + decimalHoursToMinutes(item.hours), 0);
