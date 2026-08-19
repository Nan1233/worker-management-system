const db = require('../config/db');

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

function monthRange(yearMonth) {
  const [year, month] = String(yearMonth).split('-').map(Number);
  const start = `${yearMonth}-01`;
  const nextDate = new Date(year, month, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, next };
}

async function assertReportVolume({ yearMonth, processIds = [] }) {
  const ids = [...new Set(processIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return { monthlyCount: 0, maxDailyCount: 0 };
  const { start, next } = monthRange(yearMonth);
  const placeholders = ids.map(() => '?').join(',');
  const maxMonthly = Math.max(Number(process.env.EXCEL_MAX_REPORTS_PER_MONTH || 5000), 100);
  const maxDaily = Math.max(Number(process.env.EXCEL_MAX_REPORTS_PER_DAY || 350), 20);
  const params = [start, next, ...ids];
  const [monthRows, dayRows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM production_reports WHERE status='approved' AND work_date>=? AND work_date<? AND process_id IN (${placeholders})`, params),
    query(`SELECT DATE(work_date) AS work_date, COUNT(*) AS total FROM production_reports WHERE status='approved' AND work_date>=? AND work_date<? AND process_id IN (${placeholders}) GROUP BY DATE(work_date) ORDER BY total DESC LIMIT 1`, params)
  ]);
  const monthlyCount = Number(monthRows[0]?.total || 0);
  const maxDailyCount = Number(dayRows[0]?.total || 0);
  if (monthlyCount > maxMonthly) {
    const error = new Error(`Tháng có ${monthlyCount} báo cáo, vượt giới hạn ${maxMonthly}. Hãy chia nhỏ dữ liệu xuất.`);
    error.statusCode = 413; error.code = 'EXCEL_MONTH_LIMIT'; throw error;
  }
  if (maxDailyCount > maxDaily) {
    const error = new Error(`Ngày ${String(dayRows[0]?.work_date || '').slice(0,10)} có ${maxDailyCount} báo cáo, vượt giới hạn ${maxDaily}.`);
    error.statusCode = 413; error.code = 'EXCEL_DAY_LIMIT'; throw error;
  }
  return { monthlyCount, maxDailyCount };
}

function chunkArray(values, size = 400) {
  const safeSize = Math.min(500, Math.max(100, Number(size) || 400));
  const chunks = [];
  for (let i = 0; i < values.length; i += safeSize) chunks.push(values.slice(i, i + safeSize));
  return chunks;
}

module.exports = { assertReportVolume, chunkArray, monthRange };
