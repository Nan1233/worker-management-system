const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '.env.local' });
dotenv.config();

function first(...names) {
  for (const name of names) {
    const value = String(process.env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function buildSsl() {
  const enabled = ['true', '1', 'yes'].includes(first('TIDB_ENABLE_SSL', 'DB_SSL').toLowerCase());
  if (!enabled) return undefined;
  const caPath = first('TIDB_CA_PATH', 'DB_SSL_CA');
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (caPath && fs.existsSync(caPath)) ssl.ca = fs.readFileSync(caPath);
  return ssl;
}

function connectionOptions() {
  const url = first('TIDB_DATABASE_URL', 'TIDB_URL', 'DATABASE_URL', 'DB_URL');
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 4000),
      user: decodeURIComponent(parsed.username),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
      password: decodeURIComponent(parsed.password),
      ssl: buildSsl(),
    };
  }

  const host = first('TIDB_HOST', 'DB_HOST');
  const port = Number(first('TIDB_PORT', 'DB_PORT') || 4000);
  const user = first('TIDB_USER', 'DB_USER');
  const password = first('TIDB_PASSWORD', 'DB_PASSWORD');
  const database = first('TIDB_DATABASE', 'DB_NAME');
  if (!host || !user || !database) {
    throw new Error('Thiếu cấu hình TiDB: cần TIDB_DATABASE_URL/TIDB_URL hoặc TIDB_HOST + TIDB_USER + TIDB_PASSWORD + TIDB_DATABASE');
  }
  return { host, port, user, password, database, ssl: buildSsl() };
}

function parseJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function minutes(hours) {
  return Math.round(num(hours) * 60);
}

function detailGraph(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    defects: Array.isArray(snapshot.defects) ? snapshot.defects : [],
    deductions: Array.isArray(snapshot.deductions) ? snapshot.deductions : [],
    machineLines: Array.isArray(snapshot.machineLines)
      ? snapshot.machineLines
      : Array.isArray(snapshot.machine_lines) ? snapshot.machine_lines : [],
  };
}

async function copyFromTemp(conn, report) {
  const tempId = Number(report.source_temp_id);
  if (!Number.isInteger(tempId)) return { source: null, copied: false };

  const [[temp]] = await conn.query('SELECT id FROM production_reports_temp WHERE id=? LIMIT 1', [tempId]);
  if (!temp) return { source: null, copied: false };

  const [[counts]] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM production_temp_deductions WHERE temp_report_id=?) AS deductions,
      (SELECT COUNT(*) FROM production_temp_defects WHERE temp_report_id=?) AS defects,
      (SELECT COUNT(*) FROM production_temp_machine_lines WHERE temp_report_id=?) AS machine_lines
  `, [tempId, tempId, tempId]);

  if (Number(counts.deductions) === 0 && Number(counts.defects) === 0 && Number(counts.machine_lines) === 0) {
    return { source: 'temp', copied: false, empty: true };
  }

  await conn.query(`
    INSERT INTO production_report_deductions (report_id,deduction_type_id,hours)
    SELECT ?,deduction_type_id,hours
    FROM production_temp_deductions
    WHERE temp_report_id=?
  `, [report.id, tempId]);

  await conn.query(`
    INSERT INTO production_report_defects (report_id,defect_type_id,quantity)
    SELECT ?,defect_type_id,quantity
    FROM production_temp_defects
    WHERE temp_report_id=?
  `, [report.id, tempId]);

  return {
    source: 'temp',
    copied: true,
    deductions: Number(counts.deductions),
    defects: Number(counts.defects),
    machine_lines: Number(counts.machine_lines),
  };
}

async function loadBestSnapshot(conn, reportId) {
  const [[approvedSnapshot]] = await conn.query(`
    SELECT snapshot_data
    FROM production_report_snapshots
    WHERE report_id=?
    ORDER BY created_at DESC
    LIMIT 1
  `, [reportId]);
  if (approvedSnapshot?.snapshot_data) {
    const parsed = parseJson(approvedSnapshot.snapshot_data);
    const graph = detailGraph(parsed);
    if (graph && (graph.defects.length || graph.deductions.length || graph.machineLines.length)) {
      return { source: 'approved_snapshot', graph };
    }
  }

  const [versions] = await conn.query(`
    SELECT report_type,report_id,version_no,snapshot_json
    FROM report_versions
    WHERE (report_type='approved' AND report_id=?)
       OR (report_type='temp' AND report_id IN (
          SELECT source_temp_id FROM production_reports WHERE id=?
       ))
    ORDER BY version_no DESC
  `, [reportId, reportId]);

  for (const version of versions) {
    const parsed = parseJson(version.snapshot_json);
    const graph = detailGraph(parsed);
    if (graph && (graph.defects.length || graph.deductions.length || graph.machineLines.length)) {
      return { source: `report_versions:${version.report_type}:v${version.version_no}`, graph };
    }
  }

  return null;
}

async function restoreFromSnapshot(conn, report, snapshotSource) {
  const graph = snapshotSource.graph;
  const expectedNg = Math.max(0, Math.trunc(num(report.tt_ng)));
  const actualNg = graph.defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(num(item.quantity))), 0);
  const expectedDeductionMinutes = minutes(report.deduction_time);
  const actualDeductionMinutes = Math.round(
    graph.deductions.reduce((sum, item) => sum + num(item.hours), 0) * 60,
  );

  if (expectedNg !== actualNg) {
    throw new Error(`NG snapshot không khớp: DB=${expectedNg}, snapshot=${actualNg}`);
  }
  if (Math.abs(expectedDeductionMinutes - actualDeductionMinutes) > 1) {
    throw new Error(`Trừ giờ snapshot không khớp: DB=${expectedDeductionMinutes} phút, snapshot=${actualDeductionMinutes} phút`);
  }

  if (graph.deductions.length) {
    const rows = graph.deductions
      .map((item) => [report.id, Number(item.deduction_type_id), num(item.hours)])
      .filter((item) => Number.isInteger(item[1]) && item[1] > 0 && item[2] > 0);
    if (rows.length) {
      await conn.query(
        `INSERT INTO production_report_deductions (report_id,deduction_type_id,hours) VALUES ${rows.map(() => '(?,?,?)').join(',')}`,
        rows.flat(),
      );
    }
  }

  if (graph.defects.length) {
    const rows = graph.defects
      .map((item) => [report.id, Number(item.defect_type_id), Math.trunc(num(item.quantity))])
      .filter((item) => Number.isInteger(item[1]) && item[1] > 0 && item[2] > 0);
    if (rows.length) {
      await conn.query(
        `INSERT INTO production_report_defects (report_id,defect_type_id,quantity) VALUES ${rows.map(() => '(?,?,?)').join(',')}`,
        rows.flat(),
      );
    }
  }

  // Machine-line restoration is intentionally conservative: only restore rows
  // that contain the minimum immutable fields required by the approved schema.
  for (const entry of graph.machineLines) {
    const line = entry?.line || entry;
    if (!line || !String(line.machine_code || '').trim() || !String(line.product_code || '').trim()) continue;
    await conn.query(`
      INSERT INTO production_report_machine_lines
      (report_id,machine_event_id,machine_id,machine_code,product_standard_id,standard_version_id,machine_standard_id,
       product_code,machine_time_hours,standard_output,standard_time_seconds,standard_source,exclude_kqd_from_tt,
       ok_quantity,ng_quantity,maximum_output,deduction_time_hours,deductions_json,counted_output,earned_standard_hours,
       defects_json,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      report.id,
      line.machine_event_id || null,
      line.machine_id || null,
      line.machine_code,
      line.product_standard_id || null,
      line.standard_version_id || null,
      line.machine_standard_id || null,
      line.product_code,
      num(line.machine_time_hours),
      num(line.standard_output),
      line.standard_time_seconds || null,
      line.standard_source || 'DEFAULT',
      Number(line.exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
      num(line.ok_quantity),
      num(line.ng_quantity),
      num(line.maximum_output),
      num(line.deduction_time_hours),
      typeof line.deductions_json === 'string' ? line.deductions_json : JSON.stringify(line.deductions_json ?? null),
      num(line.counted_output),
      num(line.earned_standard_hours),
      typeof line.defects_json === 'string' ? line.defects_json : JSON.stringify(line.defects_json ?? null),
      Number(line.sort_order || 1),
    ]);
  }
}

async function main() {
  const options = connectionOptions();
  console.log('[KTC] repairApprovedReportDetails connecting', {
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
  });

  const conn = await mysql.createConnection(options);
  try {
    const [reports] = await conn.query(`
      SELECT id,source_temp_id,work_date,worker_id,tt_ng,deduction_time,status
      FROM production_reports
      WHERE status='approved'
        AND (tt_ng > 0 OR deduction_time > 0
          OR NOT EXISTS (SELECT 1 FROM production_report_defects d WHERE d.report_id=production_reports.id)
          OR NOT EXISTS (SELECT 1 FROM production_report_deductions d WHERE d.report_id=production_reports.id))
      ORDER BY id
    `);

    let repaired = 0;
    let copiedDeductions = 0;
    let copiedDefects = 0;
    let unresolved = 0;

    for (const report of reports) {
      const [[counts]] = await conn.query(`
        SELECT
          (SELECT COUNT(*) FROM production_report_deductions WHERE report_id=?) AS approved_deductions,
          (SELECT COUNT(*) FROM production_report_defects WHERE report_id=?) AS approved_defects,
          (SELECT COUNT(*) FROM production_report_machine_lines WHERE report_id=?) AS approved_machine_lines
      `, [report.id, report.id, report.id]);

      const hasExpectedDetails = num(report.tt_ng) > 0 || num(report.deduction_time) > 0;
      const missingCore = Number(counts.approved_deductions) === 0 && Number(counts.approved_defects) === 0;
      if (!hasExpectedDetails && !missingCore) continue;

      await conn.beginTransaction();
      try {
        let result = await copyFromTemp(conn, report);
        if (!result.copied) {
          const snapshot = await loadBestSnapshot(conn, report.id);
          if (snapshot) {
            await restoreFromSnapshot(conn, report, snapshot);
            result = { source: snapshot.source, copied: true };
          }
        }

        const [[after]] = await conn.query(`
          SELECT
            (SELECT COUNT(*) FROM production_report_deductions WHERE report_id=?) AS deductions,
            (SELECT COUNT(*) FROM production_report_defects WHERE report_id=?) AS defects
        `, [report.id, report.id]);

        if (hasExpectedDetails && (num(report.tt_ng) > 0 && Number(after.defects) === 0 || num(report.deduction_time) > 0 && Number(after.deductions) === 0)) {
          throw new Error('Không tìm thấy nguồn detail an toàn để khôi phục');
        }

        await conn.commit();
        if (result.copied) {
          repaired += 1;
          copiedDeductions += Number(after.deductions || 0);
          copiedDefects += Number(after.defects || 0);
          console.log('[KTC] repaired approved report details', {
            approvedId: Number(report.id),
            sourceTempId: report.source_temp_id,
            source: result.source,
            deductions: Number(after.deductions || 0),
            defects: Number(after.defects || 0),
          });
        }
      } catch (error) {
        await conn.rollback();
        unresolved += 1;
        console.warn('[KTC] unresolved approved report', {
          approvedId: Number(report.id),
          sourceTempId: report.source_temp_id,
          reason: String(error?.message || error),
        });
      }
    }

    console.log(JSON.stringify({
      scanned: reports.length,
      repaired,
      copiedDeductions,
      copiedDefects,
      unresolved,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[KTC] repairApprovedReportDetails failed:', error);
  process.exitCode = 1;
});
