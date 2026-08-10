'use strict';
const db = require('../config/db');

async function scalar(sql) {
  const [rows] = await db.promise().query(sql);
  return Number(Object.values(rows[0] || {})[0] || 0);
}

async function main() {
  await db.testConnection();
  const result = {
    cong_doan: await scalar("SELECT COUNT(*) n FROM processes WHERE status='active'"),
    cong_nhan: await scalar("SELECT COUNT(*) n FROM workers WHERE status='active'"),
    may: await scalar("SELECT COUNT(*) n FROM machines WHERE status='active'"),
    phan_cong: await scalar('SELECT COUNT(*) n FROM worker_processes'),
    ma_san_pham_anh_xa: await scalar("SELECT COUNT(*) n FROM product_aliases WHERE status='active'"),
    dinh_muc_bien_the: await scalar("SELECT COUNT(*) n FROM product_standard_variants WHERE status='active'"),
    dinh_muc_dang_dung: await scalar("SELECT COUNT(*) n FROM product_standards WHERE status='active'"),
    tru_gio: await scalar("SELECT COUNT(*) n FROM deduction_types WHERE status='active'"),
    loi_ng: await scalar("SELECT COUNT(*) n FROM defect_types WHERE status='active'"),
    lan_seed: await scalar('SELECT COUNT(*) n FROM master_seed_runs')
  };
  console.table(result);
  const errors = [];
  if (result.cong_doan < 9) errors.push(`Công đoạn thiếu: ${result.cong_doan}/9`);
  if (result.cong_nhan < 590) errors.push(`Công nhân có vẻ thiếu: ${result.cong_nhan}`);
  if (result.may < 110) errors.push(`Máy có vẻ thiếu: ${result.may}`);
  if (result.ma_san_pham_anh_xa < 700) errors.push(`Ánh xạ sản phẩm có vẻ thiếu: ${result.ma_san_pham_anh_xa}`);
  if (result.dinh_muc_bien_the < 1900) errors.push(`Định mức biến thể có vẻ thiếu: ${result.dinh_muc_bien_the}`);
  if (errors.length) throw new Error(errors.join('; '));
  console.log('[KTC] KIỂM TRA MASTER DATA: ĐẠT');
}

main().catch((e) => { console.error('[KTC] KIỂM TRA THẤT BẠI:', e.message); process.exitCode=1; })
.finally(async()=>{ await db.closePool().catch(()=>undefined); });
