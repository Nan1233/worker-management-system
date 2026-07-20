const ExcelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");

const HEADERS = [
  "STT", "Mã công nhân", "Họ tên", "Máy", "Ca", "% học việc",
  "Tổng thời gian", "Thời gian thực tế", "Chênh lệch thời gian", "Tổng thời gian trừ",
  "Thiếu sản lượng", "Bật máy, xét máy", "Chuyển mã", "Chỉnh máy", "Chờ chỉnh máy",
  "Mất điện", "Mất khí", "Chờ hàng", "Bảo dưỡng máy", "Nghỉ giải lao", "Giao ca",
  "Dừng máy đi hỗ trợ", "Giặt/cân/tuốt/tái PP/GL", "5S", "Học việc, đào tạo",
  "Lý do dừng máy", "Sản phẩm", "Sản lượng chuẩn", "Tổng sản lượng", "Hiệu suất",
  "Ngày làm việc", "Sản lượng/giờ", "OK", "NG", "Tỷ lệ NG", "Ghi chú NG",
  "KQĐ dập lại", "KQĐ tuột", "Vỡ do lồng", "Xước do lồng", "Cong gãy", "Xoay",
  "Không đứt", "Bavia hụt", "PPCM", "Lỗi cao su", "NG kích thước", "Cắt lẹm",
  "Chặn ngắn dài", "Sót via", "Fure trục", "Trạng thái", "Ghi chú"
];

const normalizeText = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const toNumber = (value) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const sumMatching = (items, aliases, valueKey, codeKey, nameKey) => {
  const normalizedAliases = aliases.map(normalizeText);
  return (items || []).filter((item) => {
    const code = normalizeText(item[codeKey]);
    const name = normalizeText(item[nameKey]);
    return normalizedAliases.some((alias) => alias === code || alias === name || name.includes(alias));
  }).reduce((total, item) => total + toNumber(item[valueKey]), 0);
};

const deduction = (report, aliases) => sumMatching(
  report.deductions, aliases, "hours", "deduction_code", "deduction_name"
);
const defect = (report, aliases) => sumMatching(
  report.defects, aliases, "quantity", "defect_code", "defect_name"
);

const dateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const displayDate = (value) => {
  const key = dateKey(value);
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};

const safePathPart = (value, fallback) => String(value || fallback)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

const sortReports = (first, second) => {
  const byDate = dateKey(first.work_date).localeCompare(dateKey(second.work_date));
  if (byDate) return byDate;
  const byWorker = String(first.worker_code || "").localeCompare(String(second.worker_code || ""), undefined, { numeric: true });
  return byWorker || Number(first.id) - Number(second.id);
};

const buildDataRow = (report, sequence, excelRow) => {
  const ok = toNumber(report.tt_ok);
  const ng = toNumber(report.tt_ng);
  return [
    sequence, report.worker_code || "", report.full_name || "", report.machine_no || "", report.shift || "",
    toNumber(report.training_percent || 100) / 100,
    toNumber(report.total_time), toNumber(report.actual_time),
    toNumber(report.total_time) - toNumber(report.actual_time), toNumber(report.deduction_time),
    deduction(report, ["THIEU_SP", "Thiếu sản lượng"]),
    deduction(report, ["BAT_MAY", "Bật máy, xét máy"]),
    deduction(report, ["CHUYEN_MA", "Chuyển mã"]),
    deduction(report, ["CHINH_MAY", "Chỉnh máy"]),
    deduction(report, ["CHO_CHINH_MAY", "Chờ chỉnh máy"]),
    deduction(report, ["MAT_DIEN", "Mất điện"]), deduction(report, ["MAT_KHI", "Mất khí"]),
    deduction(report, ["CHO_HANG", "Chờ hàng"]), deduction(report, ["BAO_DUONG", "Bảo dưỡng máy"]),
    deduction(report, ["NGHI_GIAI_LAO", "Nghỉ giải lao"]), deduction(report, ["GIAO_CA", "Giao ca"]),
    deduction(report, ["HO_TRO", "Dừng máy đi hỗ trợ"]),
    deduction(report, ["GIAT_CAN", "Giặt cs/cân cs, tuốt-tái pp, GL"]),
    deduction(report, ["5S"]), deduction(report, ["HOC_VIEC", "Học việc, đào tạo"]),
    report.stop_reason || "", report.product_name || "", toNumber(report.standard_output),
    { formula: `AG${excelRow}+AH${excelRow}` }, { formula: `IFERROR(AC${excelRow}/AB${excelRow},0)` },
    displayDate(report.work_date), { formula: `IFERROR(AC${excelRow}/H${excelRow},0)` }, ok, ng,
    { formula: `IFERROR(AH${excelRow}/AC${excelRow},0)` }, report.ng_note || "",
    defect(report, ["KQD_DAP_LAI", "KQĐ dập lại", "Dập lại"]),
    defect(report, ["KQD_TUOT", "KQĐ tuột", "Tuột"]),
    defect(report, ["VO_DO_LONG", "VO_LONG", "Vỡ do lồng"]),
    defect(report, ["XUOC_DO_LONG", "XUOC_LONG", "Xước do lồng"]),
    defect(report, ["CONG_GAY", "Cong gãy"]), defect(report, ["XOAY", "Xoay"]),
    defect(report, ["KHONG_DUT", "Không đứt"]), defect(report, ["BAVIA_HUT", "BAVIA", "Bavia hụt"]),
    defect(report, ["PPCM"]), defect(report, ["LOI_CAO_SU", "CAO_SU", "Lỗi cao su"]),
    defect(report, ["NG_KICH_THUOC", "KT", "NG kích thước"]), defect(report, ["CAT_LEM", "Cắt lẹm"]),
    defect(report, ["CHAN_NGAN_DAI", "CHAN_NGAN", "Chặn ngắn dài"]),
    defect(report, ["SOT_VIA", "SOT_BAVIA", "Sót via"]),
    defect(report, ["FURE_TRUC", "FURE", "Fure trục"]), report.status || "approved", report.note || ""
  ];
};

const createWorkbook = async (reports) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KTC Worker Management System";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Cắt lồng", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(HEADERS);
  const header = sheet.getRow(1);
  header.height = 42;
  header.font = { bold: true };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  const widths = HEADERS.map((title, index) => ({ width: index === 2 ? 24 : index === 52 ? 28 : Math.min(20, Math.max(10, title.length + 2)) }));
  sheet.columns = widths;
  let currentDate = "";
  let sequence = 0;
  reports.sort(sortReports).forEach((report) => {
    const key = dateKey(report.work_date);
    if (key !== currentDate) {
      currentDate = key;
      sequence = 0;
      const dateRow = sheet.addRow([displayDate(report.work_date)]);
      dateRow.font = { bold: true };
      dateRow.getCell(1).alignment = { horizontal: "left" };
    }
    sequence += 1;
    const excelRow = sheet.rowCount + 1;
    const row = sheet.addRow(buildDataRow(report, sequence, excelRow));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.getCell("F").numFmt = "0.00%";
    row.getCell("AD").numFmt = "0.00%";
    row.getCell("AI").numFmt = "0.00%";
  });
  sheet.autoFilter = { from: "A1", to: "BA1" };
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  return workbook;
};

const saveArchiveCopy = async (workbook, reports) => {
  const positions = [...new Set(reports.map((r) => r.position).filter(Boolean))];
  const positionFolder = positions.length === 1 ? safePathPart(positions[0], "Khong-xac-dinh") : "Tong-hop";
  const months = [...new Set(reports.map((r) => dateKey(r.work_date).slice(0, 7)).filter(Boolean))];
  const month = months.length === 1 ? months[0] : "nhieu-thang";
  const year = /^\d{4}-/.test(month) ? month.slice(0, 4) : "Tong-hop";
  const root = process.env.EXCEL_EXPORT_ROOT || path.join(process.cwd(), "exports");
  const folder = path.join(root, positionFolder, year, month);
  await fs.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, `bao-cao-cat-long-${month}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
};

const buildConsolidatedWorkbook = async (reports) => {
  const workbook = await createWorkbook(reports);
  let archivePath = null;
  try {
    archivePath = await saveArchiveCopy(workbook, reports);
  } catch (error) {
    console.error("SAVE EXCEL ARCHIVE ERROR:", error);
  }
  return { workbook, archivePath };
};

module.exports = { buildConsolidatedWorkbook, HEADERS };
