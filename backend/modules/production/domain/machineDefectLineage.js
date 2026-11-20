// Domain: immutable mapping of temporary NG defects to their source machine line.
// A mismatched lineage must fail closed before an approved snapshot is written.
// Preserve the database's defect order and attach only matching machine-line defects.
// Keep this mapping pure so approval snapshots can be regression-tested without a DB.
function attachMachineLineDefects(lines, defects) {
  const validLineIds = new Set(lines.map((line) => Number(line.id)));
  const byLine = new Map();
  for (const defect of defects) {
    const rawLineId = defect?.machine_line_id;
    const key = Number(rawLineId);
    if ((typeof rawLineId !== "number" && (typeof rawLineId !== "string" || !/^[0-9]+$/.test(rawLineId)))
      || !Number.isSafeInteger(key) || key <= 0 || !validLineIds.has(key)) {
      const error = new Error("Lỗi NG tham chiếu dòng máy tạm không hợp lệ; đã hủy duyệt để bảo vệ dữ liệu");
      error.status = 500;
      error.code = "TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH";
      error.isPublic = true;
      throw error;
    }
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(defect);
  }
  return lines.map((line) => ({ ...line, defects: byLine.get(Number(line.id)) || [] }));
}


module.exports = { attachMachineLineDefects };
