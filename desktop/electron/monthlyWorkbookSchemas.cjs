// Stable sheet mapping and baseline template definitions for KTC workbooks.
// Preserve insertion order, labels and field types; workbook formatting/writing
// belongs to the monthlyWorkbook* modules; these frozen contracts must not be mutated.
const PROCESS_SHEETS = Object.freeze({
  CAN: { sheet: 'CÁN', title: 'CÁN', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  EP: { sheet: 'ÉP', title: 'ÉP', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  XLBV: { sheet: 'XỬ LÝ BAVIA', title: 'XỬ LÝ BAVIA', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  GC: { sheet: 'CẮT LỒNG', title: 'CẮT/LỒNG', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  MAI: { sheet: 'MÀI', title: 'MÀI', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  DO: { sheet: 'ĐO', title: 'ĐO', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  K1: { sheet: 'KIỂM 1', title: 'KIỂM 1', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  K2: { sheet: 'KIỂM 2', title: 'KIỂM 2', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' },
  SX3: { sheet: 'SẢN XUẤT 3', title: 'SẢN XUẤT 3', deductionGroup: 'LỖI MÁY / THỜI GIAN TRỪ', defectGroup: 'NG PART' },
  CVK: { sheet: 'CÔNG VIỆC KHÁC', title: 'CÔNG VIỆC KHÁC (CVK)', deductionGroup: 'CHI TIẾT THỜI GIAN TRỪ', defectGroup: 'CHI TIẾT NG' }
});


// Danh mục cố định đọc từ desktop/assets/templates/file-mau.xlsx.
// Mỗi công đoạn có cấu trúc riêng; master DB và dữ liệu thực tế được ghép thêm
// để không mất loại mới, nhưng các cột mẫu không biến mất khi tháng hiện tại = 0.
const PROCESS_TEMPLATE_SCHEMAS = Object.freeze({
  GC: {
    deductions: ['Thiếu sản lượng','Bật máy, xét máy','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mất điện','Mất khí','Chờ hàng','Bảo dưỡng máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','Giặt cs/cân cs, tuốt-tái pp, GL','5S','Học việc, đào tạo','Đi muộn về sớm'],
    defects: ['KQD','Vỡ cao su','K xước cong gãy','Cao su xoay','Cắt không đứt','Bavia','CSH','PPCM','KT lớn','KT nhỏ','LCS','Cắt lẹm','Rách NVL','Chân ngắn dài','Sót via','Fure trục']
  },
  MAI: {
    deductions: ['Thiếu sản lượng','Bật máy, xét máy, đầu giờ','Chuyển mã','Chỉnh máy','Chờ chỉnh máy','Mài đá','Bảo dưỡng máy','Ko có KHSX, Dừng máy ko HT','Chờ hàng, hết hàng','Khí yếu','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','5s, đổ bụi,xì bụi,lấy bụi','Học việc','Thổi bụi,lấy bụi','Đi đo kiểm soát','Đi muộn/về sớm','Tắt máy hút bụi','Mất điện'],
    defects: ['KQD ĐẢO','Xô cs','PPCM / Mất điện','Hàng rơi','K- coleet','Thiếu - lẫn cs / CSH','Lỗi cao su']
  },
  DO: {
    deductions: ['Thiếu sản lượng','Chỉnh máy','Mất điện','Ko có KHSX','Chờ chỉnh máy','Nghỉ giải lao','Giao ca','Dừng máy đi hỗ trợ','5s/lấy bụi','Rải hàng, mài, cv khác','Lưu DL','KS DF, KS đầu giờ','Thổi bụi','Khác,đẩy hàng xuất','Đi muộn về sớm','Kiểm kho','Học việc, đào tạo'],
    defects: ['Lớn','Nhỏ','Fure cao su','Fure trục','Trục cong','Lệch điểm','Lỗi cao su','Đảo cs','Lỗi trục','Chưa mài','Mài 2 lần','Hở vai']
  },
  K1: {
    extras: [
      { key: 'press_date', header: 'Ngày tháng Ép', kind: 'date' },
      { key: 'press_box_shift', header: 'Ca / thùng Ép', kind: 'text' },
      { key: 'deduction_work', header: 'Công việc trừ giờ', kind: 'text' },
      { key: 'late_early_hours', header: 'Đi muộn, về sớm', kind: 'decimal' },
      { key: 'xlbv_deduction_worker', header: 'Trừ giờ XLBV (người làm)', kind: 'text' }
    ],
    deductions: ['Thiếu sản lượng'],
    defects: ['Dị vật do NVL','Tạp chất do NVL','DV dính via','DV do SX1','Bẩn do NVL','Bẩn (đen, trắng,vàng)','Bẩn khuôn','Bẩn chờ giặt','Biến dạng','Cách bậc','Thiếu NL','Bít lỗ','NG kích thước','Tắc vòi','NG KT','Lỗi khuôn','Hằn','Rách ĐPK','Rách','Rách lỗ rót','Xước sơn','Hở sắt','Rách do XLBV','Dính bavia','Bavia lòng trong','Chờ XLBV','Khác màu','Loang màu','Lẫn khuôn','Không khí - sống','Lỗi khác']
  },
  K2: {
    deductions: ['Thiếu sản lượng','Nghỉ giải lao','5S','Chuyển mã','Lau ố, lau gót chống','Lăn mốc','Hỗ trợ','Lau khay, lọc khay','Quét hàng, thổi bụi','Giao ca','Học kiểm, đào tạo','Check hàng','Xem MGH, mất điện','Lấy hàng và cất hàng','Đi muộn về sớm'],
    defects: ['Nứt vỡ, CSN, KĐĐ','Cắt lẹm, CP, 502','CS bẩn (hủy)','Bavia do cắt, không chân số','Lõm csu','Đảo, BD, HV','Mặt mài','Lẫn csu, thiếu cs','Không ĐT','Lồng- mài ngược','Coleet, K gót','K rãnh','K do gia lưu','K do gá','K va vào đá','Trục xước, bv trục','Dập trục','Bẩn Trục','Trục sét, lớp mạ','KNCC','BV đầu vào','Rỗ khí','Lỗ rách','Rách lòng trong','Rách cs non','Dị vật','Mài sót','MM Loang- sần, lõm','Mẻ cạnh, mẻ bánh răng','Nứt đường phân khuôn','Lẫn NVL','Bẩn NCC','Mốc cs','Chân bánh răng ngắn-dài, Cao su ngắn','Cao su dài','CHÂN BV SÂU, thiếu gate, chân gate cao','MM thô','NDPK','Hằn cs, nhăn','LBM','Rách ngang','CS BÓNG','NG-bàn đá','CS móp','Bavia bánh răng','KHOẢNG SÁNG','Lỗi rót','Khác','Tên lỗi khác(KĐTâm)','HCKT','Tái đi CVN','THIẾU LIỆU','CHỜ XLBV']
  },
  CAN: {
    extras: [
      { key: 'material_code', header: 'Mã nguyên liệu', kind: 'text' },
      { key: 'rolling_hours', header: 'Thời gian cán', kind: 'decimal' },
      { key: 'stop_reason', header: 'Lý do dừng máy', kind: 'text' }
    ],
    deductions: ['Vệ sinh máy cán','Sửa máy','Nghỉ giải lao','5S','Dừng sản xuất','CAN HC'],
    defects: ['Chân không','Rách vỡ','Bề mặt','Bavia']
  },
  EP: {
    extras: [
      { key: 'press_box_shift', header: 'Ca / thùng Ép', kind: 'text' },
      { key: 'handler', header: 'Người xử lý ép/bavia', kind: 'text' }
    ],
    deductions: ['Vệ sinh khuôn','Thay khuôn','5S + giao ca','Hâm khuôn','Sửa khuôn','Sửa máy','Nghỉ giải lao','Dừng máy','Thời gian trừ không đạt năng suất'],
    defects: ['Chân không','Rách vỡ','TNL','Dính via','Dị vật','Dính khuôn','Tạp chất']
  },
  XLBV: {
    extras: [
      { key: 'stop_operation_hours', header: 'Thời gian dừng thao tác', kind: 'decimal' },
      { key: 'deduction_work', header: 'Công việc', kind: 'text' },
      { key: 'shortage_hours', header: 'Thiếu SL', kind: 'decimal' }
    ],
    deductions: [],
    defects: ['CHÂN KHÔNG','RÁCH VỠ','XLBV','BẨN KHUÔN','TNL','DỊ VẬT','DẬP KO HẾT','BIẾN DẠNG','HỞ SẮT','Xước trục','CHỜ XL LẠI BV','KHÁC MÀU','BẨN']
  },
  CVK: {
    extras: [
      { key: 'work_type', header: 'Mã công việc CVK', kind: 'text' }
    ],
    deductions: [],
    defects: []
  },
  SX3: {
    extras: [
      { key: 'work_minutes', header: 'Thời gian làm việc', kind: 'decimal' },
      { key: 'assembly_minutes', header: 'Thời gian lắp ráp thực tích', kind: 'decimal' },
      { key: 'tray_minutes', header: 'SỐ THAU', kind: 'decimal' },
      { key: 'plan_quantity', header: 'Kế hoạch', kind: 'integer' }
    ],
    deductions: ['Kẹt Bushing','Kẹt Tray Roller','Kẹt Slitring 1','Kẹt slitring 2','Kẹt washer','Thả bushing sai vị trí','Tay gắp gear sai','Kẹt Gear trên tay gắp','Tay gắp làm vỡ Gear','Rơi Gear','Tray Gear + Tray Roller lên quá hành trình','Bowl gỡ lò xo bị kẹt','Rơi đạn','Lỗi Xilanh 14 or 15','Lỗi Xilanh 16','Lỗi Xilanh 21','Lỗi Xilanh 42','Lỗi SS Washer','PUSH - NG Xilanh5','Lỗi vị trí Robot 3','Robot 6 Alam','Robot 8 Alam','Robot 9 Alam','Robot 10 Alam','Lỗi khác'],
    defects: ['Thiếu Slitring 1','Khe hở Slitring 1 lớn','Lắp 2 Slitring 1','Thiếu Washer','Thiếu Slitring & Washer','Lắp 2 Slitring & 2 Washer','Cao su lệch vị trí or đảo','Cao su bị rách, xước','Thiếu Slitring 2','Khe hở Slitring 2 lớn','Lắp 2 Slitring 2','Bushing xước, biến dạng, GÃY','Thiếu Bushing','Lắp 2 Bushing','Ngược Bushing','Thiếu Slitring 2 & Bushing','Slitring 2 không vào vấu','Lắp 2 lò xo','Thiếu Gear','Gear lắp quá tiêu chuẩn QAFC','Lực p/hủy Gear ngoài t/chuẩn','Gear dính bẩn','Lắp 2 Gear','Mẻ Gear','Thiếu Gear & Lò xo','Slitring mắc vào lò xo','Cong, Xước trục roller or Trục roller biến dạng','BẨN SLITRING','Bushing có vết bẩn','Kẹt bushing','RP']
  }
});


module.exports = { PROCESS_SHEETS, PROCESS_TEMPLATE_SCHEMAS };
