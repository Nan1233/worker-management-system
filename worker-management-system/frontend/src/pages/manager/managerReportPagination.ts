export const getManagerReportRowNumber = (currentPage: number, index: number, pageSize = 20): number =>
  Math.max(0, (Number(currentPage) - 1) * pageSize + Number(index) + 1);
