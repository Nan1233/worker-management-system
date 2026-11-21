'use strict';

const asNumeric = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

/** Resolve the production date from report data, never from submission time. */
function reportWorkDate(report, code, yearMonth, dateKey) {
  const candidates = [
    report?.work_date, report?.workDate, report?.production_date,
    report?.productionDate, report?.report_date, report?.reportDate,
  ];
  for (const raw of candidates) {
    const key = dateKey(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && key.slice(0, 7) === yearMonth) return key;
  }
  const fields = Object.keys(report || {}).filter((key) => /date|ngay/i.test(key)).join(',');
  throw new Error('Báo cáo ' + code + ' (id=' + String(report?.id ?? '?') + ') thiếu ngày sản xuất thuộc ' + yearMonth + '; dateFields=' + fields);
}

/** Produce template-neutral cell values without manipulating an ExcelJS worksheet. */
function reportRowValues({ snapshot, day, stt, code, report, extra }) {
  const [year, month, date] = day.split('-').map(Number);
  const values = {
    ...snapshot,
    stt,
    date: new Date(Date.UTC(year, month - 1, date)),
    expectedOutput: (asNumeric(snapshot.standard) || 0) * (asNumeric(snapshot.actualTime) || 0),
  };
  if (code === 'GC') {
    const nonProduct = extra.non_product_work === true || extra.non_product_work === 1
      || String(extra.non_product_work || '').toLowerCase() === 'true';
    if (nonProduct) {
      const raw = String(extra.work_type ?? extra.workType ?? report.work_type ?? '').trim().toUpperCase();
      const types = { TAIPP: 'TPP', TPP: 'TPP', XUATNHAP: 'XN', XN: 'XN', KTCD: 'KTCD' };
      values.product = types[raw] || raw || null;
    }
  }
  return values;
}

module.exports = { reportWorkDate, reportRowValues };
