import { allNgOptions, deductionOptions } from "./processPageConfig";

export type WorkerMasterOption = {
  id?: number;
  code: string;
  label: string;
  key: string;
  process_id?: number;
  defect_type_id?: number;
  deduction_type_id?: number;
  defect_code?: string;
  defect_name?: string;
  deduction_code?: string;
  deduction_name?: string;
};

type RawOption = {
  id?: number | string | null;
  process_id?: number | string | null;
  processId?: number | string | null;
  defect_type_id?: number | string | null;
  defect_code?: string | null;
  defect_name?: string | null;
  deduction_type_id?: number | string | null;
  deduction_code?: string | null;
  deduction_name?: string | null;
  code?: string | null;
  label?: string | null;
  name?: string | null;
};

const clean = (value: unknown): string => String(value ?? "").trim();
const same = (a: unknown, b: unknown): boolean => {
  const left = clean(a).toUpperCase();
  const right = clean(b).toUpperCase();
  return Boolean(left && right && left === right);
};

const fallback = (prefix: string, labels: string[], processId: number): WorkerMasterOption[] => {
  const seen = new Set<string>();
  return labels
    .map((label) => clean(label))
    .filter((label) => {
      const key = label.toUpperCase();
      if (!label || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((label, index) => {
      const code = `${prefix}_${String(index + 1).padStart(2, "0")}`;
      return { code, label, key: `defect_${processId}_${index + 1}`, process_id: processId, defect_code: code, defect_name: label };
    });
};

const PROCESS_DEFECT_FALLBACKS: Record<number, WorkerMasterOption[]> = {
  1: fallback("CUT", ["KQD", "Vỡ cao su", "K xước cong gãy", "Cao su xoay", "Cắt không đứt", "Bavia", "CSH", "PPCM", "KT lớn", "KT nhỏ", "LCS", "Cắt lẹm", "Rách NVL", "Chân ngắn dài", "Sót via", "Fure trục"], 1),
  2: fallback("MAI", ["KQD ĐẢO", "Xô cs", "PPCM Mất điện", "Hàng rơi", "K- coleet", "Thiếu - lẫn cs CSH", "Lỗi cao su"], 2),
  3: fallback("K1", ["Dị vật do NVL", "Tạp chất do NVL", "DV dính via", "DV do SX1", "Bẩn do NVL", "Bẩn (đen, trắng,vàng)", "Bẩn khuôn", "Bẩn chờ giặt", "Biến dạng", "Cách bậc", "Thiếu NL", "Bít lỗ", "NG kích thước", "Tắc vòi", "NG KT", "Lỗi khuôn", "Hằn", "Rách ĐPK", "Rách", "Rách lỗ rót", "Xước sơn", "Hở sắt", "Rách do XLBV", "Dính bavia", "Bavia lòng trong", "Chờ XLBV", "Khác màu", "Loang màu", "Lẫn khuôn", "Không khí - sống", "Lỗi"], 3),
  4: fallback("K2", ["Nứt vỡ, CSN, KĐĐ", "Cắt lẹm, CP, 502", "cs bẩn (hủy)", "Bavia do cắt, không chân số", "Lõm csu", "Đảo, BD, HV", "Mặt mài", "Lẫn csu, thiếu cs", "Không ĐT", "Lồng- mài ngược", "Coleet, K gót", "K rãnh", "K do gia lưu", "K do gá", "K va vào đá", "Trục xước, bv trục", "Dập trục", "Bẩn Trục", "Trục sét, lớp mạ", "KNCC", "BV đầu vào", "Rỗ khí", "Lỗ rách", "Rách lòng trong", "Rách cs non", "Dị vật", "Mài sót", "MM Loang- sần, lõm", "Mẻ cạnh, mẻ bánh răng", "Nứt đường phân khuôn", "Lẫn NVL", "Bẩn NCC", "Mốc cs", "Chân bánh răng ngắn-dài, Cao su ngắn", "Cao su dài", "CHÂN BV SÂU, thiếu gate, chân gate cao", "mm thô", "NDPK", "Hằn cs, nhăn", "LBM", "Rách ngang", "CS BÓNG", "NG-bàn đá", "CS móp", "Bavia bánh răng", "KHOẢNG SÁNG", "Lỗi rót", "Khác", "Tên lỗi khác(KĐTâm)", "HCKT", "Tái đi CVN", "THIẾU LIỆU", "CHỜ XLBV"], 4),
  60001: fallback("DO", ["Lớn", "Nhỏ", "Fure cao su", "Fur trục", "Lẫn hàng"], 60001),
  60002: fallback("CAN", ["Chân không", "Rách vỡ", "Bề mặt", "Bavia"], 60002),
  60003: fallback("EP", ["Chân không", "Rách vỡ", "Thiếu liệu", "Dính via", "Di vật", "dính khuôn", "Tạp chất"], 60003),
  60004: fallback("XLBV", ["CHÂN KHÔNG", "RÁCH VỠ", "XLBV", "BẨN KHUÔN", "TNL", "DỊ VẬT", "KHOAN KO HẾT", "BIẾN DẠNG", "HỞ SẮT", "xước trục", "CHỜ XL LAI BV", "KHÁC MÀU", "BẨN", "KO QUA ZICK", "KHÁC"], 60004),
  60005: fallback("SX3", ["LỖI MÁY: Kẹt Bushing", "LỖI MÁY: Kẹt Tray Roller", "LỖI MÁY: Kẹt Slitring 1", "LỖI MÁY: Kẹt slitring 2", "LỖI MÁY: Kẹt washer", "LỖI MÁY: Thả bushing sai vị trí", "LỖI MÁY: Tay gắp gear sai", "LỖI MÁY: Kẹt Gear trên tay gắp", "LỖI MÁY: Tay gắp làm vỡ Gear", "LỖI MÁY: Rơi Gear", "LỖI MÁY: Tray Gear + Tray Roller lên quá hành trình", "LỖI MÁY: Bowl gỡ lò xo bị kẹt", "LỖI MÁY: Rơi đạn", "LỖI MÁY: Lỗi Xilanh 14 or 15", "LỖI MÁY: Lỗi Xilanh 16", "LỖI MÁY: Lỗi Xilanh 21", "LỖI MÁY: Lỗi Xilanh 42", "LỖI MÁY: Lỗi SS Washer", "LỖI MÁY: PUSH - NG Xilanh5", "LỖI MÁY: Lỗi vị trí Robot 3", "LỖI MÁY: Robot 6 Alam", "LỖI MÁY: Robot 8 Alam", "LỖI MÁY: Robot 9 Alam", "LỖI MÁY: Robot 10 Alam", "LỖI MÁY: Lỗi khác", "NG PART: Thiếu Slitring 1", "NG PART: Khe hở Slitring 1 lớn", "NG PART: Lắp 2 Slitring 1", "NG PART: Thiếu Washer", "NG PART: Thiếu Slitring & Washer", "NG PART: Lắp 2 Slitring & 2 Washer", "NG PART: Cao su lệch vị trí or đảo", "NG PART: Cao su bị rách, xước", "NG PART: Thiếu Slitring 2", "NG PART: Khe hở Slitring 2 lớn", "NG PART: Lắp 2 Slitring 2", "NG PART: Bushing xước, biến dạng, GÃY", "NG PART: Thiếu Bushing", "NG PART: Lắp 2 Bushing", "NG PART: Ngược Bushing", "NG PART: Thiếu Slitring 2 & Bushing", "NG PART: Slitring 2 không vào vấu", "NG PART: Lắp 2 lò xo", "NG PART: Thiếu Gear", "NG PART: Gear lắp quá tiêu chuẩn QAFC", "NG PART: Lực p/hủy Gear ngoài t/chuẩn", "NG PART: Gear dính bẩn", "NG PART: Lắp 2 Gear", "NG PART: Mẻ Gear", "NG PART: Thiếu Gear & Lò xo", "NG PART: Slitring mắc vào lò xo", "NG PART: Cong, Xước trục roller or Trục roller biến dạng", "NG PART: BẨN SLITRING", "NG PART: Bushing có vết bẩn", "NG PART: kẹt bushing", "NG PART: RP"], 60005),
};

const normalizeRows = (rows: RawOption[], processId?: number): WorkerMasterOption[] => rows
  .map((row, index) => {
    const id = Number(row.id ?? row.defect_type_id ?? 0) || undefined;
    const code = clean(row.defect_code ?? row.code);
    const name = clean(row.defect_name ?? row.label ?? row.name);
    const configured = allNgOptions.find((option) => same(option.code, code) || same(option.label, name));
    const canonicalCode = code || clean(configured?.code) || `DEFECT_${processId ?? 0}_${index + 1}`;
    const key = clean(configured?.key) || canonicalCode || `defect_${id ?? index + 1}`;
    const label = name || clean(configured?.label) || canonicalCode || `Lỗi NG ${index + 1}`;
    return { id, process_id: processId, defect_type_id: id, code: canonicalCode, label, key, defect_code: canonicalCode, defect_name: label };
  })
  .filter((option) => Boolean(option.key));

function mergeOptions(base: WorkerMasterOption[], extra: WorkerMasterOption[]): WorkerMasterOption[] {
  const result = [...base];
  for (const option of extra) {
    const exists = result.some((item) =>
      (option.defect_type_id && item.defect_type_id === option.defect_type_id) ||
      (option.deduction_type_id && item.deduction_type_id === option.deduction_type_id) ||
      (option.defect_code && item.defect_code && same(option.defect_code, item.defect_code)) ||
      (option.deduction_code && item.deduction_code && same(option.deduction_code, item.deduction_code)) ||
      same(option.label, item.label),
    );
    if (!exists) result.push(option);
  }
  return result;
}

export function normalizeDefectOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });
  const template = processId == null ? [] : (PROCESS_DEFECT_FALLBACKS[Number(processId)] ?? []);
  const dbOptions = normalizeRows(scopedRows, processId);
  if (template.length === 0) return dbOptions;

  const matchedTemplate = template.map((item) => {
    const db = dbOptions.find((candidate) => same(candidate.defect_name, item.label) || same(candidate.defect_code, item.code));
    return db ? { ...item, id: db.id, defect_type_id: db.defect_type_id, code: db.code || item.code, defect_code: db.defect_code || item.defect_code } : item;
  });
  return mergeOptions(matchedTemplate, dbOptions);
}

export function normalizeDeductionOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });

  const dbOptions = scopedRows
    .map((row, index) => {
      const id = Number(row.id ?? row.deduction_type_id ?? 0) || undefined;
      const code = clean(row.deduction_code ?? row.code);
      const name = clean(row.deduction_name ?? row.label ?? row.name);
      const configured = deductionOptions.find((option) => same(option.label, name)) ?? deductionOptions.find((option) => same(option.key, code));
      const canonicalCode = code || clean(configured?.key);
      const key = clean(configured?.key) || canonicalCode || `deduction_${id ?? index + 1}`;
      const label = name || clean(configured?.label) || canonicalCode || `Trừ giờ ${index + 1}`;
      return { id, process_id: processId, deduction_type_id: id, code: canonicalCode, label, key, deduction_code: canonicalCode, deduction_name: label };
    })
    .filter((option) => Boolean(option.key));

  const configuredOptions: WorkerMasterOption[] = deductionOptions.map((option) => ({
    code: option.key,
    label: option.label,
    key: option.key,
    process_id: processId,
    deduction_code: option.key,
    deduction_name: option.label,
  }));

  return mergeOptions(configuredOptions, dbOptions);
}
