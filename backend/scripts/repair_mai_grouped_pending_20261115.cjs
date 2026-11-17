#!/usr/bin/env node
"use strict";

/**
 * One-off repair for verified grouped MAI pending reports dated 2026-11-15.
 * Run from backend/ using a backed-up TiDB database:
 *   node scripts/repair_mai_grouped_pending_20261115.cjs
 *   node scripts/repair_mai_grouped_pending_20261115.cjs --apply
 * Default is READ-ONLY. No automatic execution on startup or deploy.
 */
const crypto = require("node:crypto");
const db = require("../config/db");
const APPLY = process.argv.includes("--apply");
const SOURCES = [
  { id: 2520008, worker: 162, lines: [
    [2310007, "20", "16M-20", 913],
    [2310008, "20", "8UM-20", 2060],
  ] },
  { id: 2610012, worker: 159, lines: [
    [2400012, "28", "6488-2", 3420],
    [2400013, "28", "6488-2", 180],
  ] },
];
const num = (v) => Number(v || 0);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const json = (v, fallback) => {
  if (v == null || v === "") return fallback;
  if (typeof v === "object") return v;
  return JSON.parse(v);
};
const run = async (conn, sql, args = []) => (await conn.query(sql, args))[0];
const requestKey = (source, line) => `mai-repair-20261115-${source}-${line}`;
const dateValue = (value) => value instanceof Date
  ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

async function preflight(conn, locked) {
  const groups = [];
  for (const source of SOURCES) {
    const parents = await run(conn,
      `SELECT * FROM production_reports_temp WHERE id=? ${locked ? "FOR UPDATE" : ""}`,
      [source.id]);
    check(parents.length === 1, `Missing source #${source.id}`);
    const parent = parents[0];
    check(parent.status === "pending" && num(parent.worker_id) === source.worker &&
      num(parent.process_id) === 2 && dateValue(parent.work_date) === "2026-11-15",
      `Unexpected source state #${source.id}`);
    const lines = await run(conn,
      `SELECT * FROM production_temp_machine_lines WHERE temp_report_id=?
        ORDER BY sort_order,id ${locked ? "FOR UPDATE" : ""}`, [source.id]);
    check(lines.length === source.lines.length, `Unexpected line count for #${source.id}`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], [id, machine, product, ok] = source.lines[i];
      check(num(line.id) === id && String(line.machine_code) === machine &&
        String(line.product_code) === product && num(line.ok_quantity) === ok,
        `Line mismatch: ${id}`);
      check(num(line.ng_quantity) === 0 &&
        num(line.machine_time_hours) >= num(line.deduction_time_hours),
        `Unexpected NG/time data for line #${id}`);
      const defects = json(line.defects_json, []);
      check(Array.isArray(defects) && defects.length === 0,
        `Unexpected line defects #${id}`);
      const individualDefects = await run(conn,
        "SELECT id FROM production_temp_machine_defects WHERE machine_line_id=? LIMIT 1", [id]);
      check(individualDefects.length === 0, `Unexpected machine defects #${id}`);
    }
    check(lines.reduce((sum, l) => sum + num(l.ok_quantity), 0) === num(parent.tt_ok) &&
      lines.reduce((sum, l) => sum + num(l.ng_quantity), 0) === num(parent.tt_ng) &&
      Math.abs(lines.reduce((sum, l) => sum + num(l.counted_output), 0) - num(parent.actual_output)) < 0.00001,
      `Parent totals mismatch #${source.id}`);
    const parentDefects = await run(conn,
      "SELECT id FROM production_temp_defects WHERE temp_report_id=? LIMIT 1", [source.id]);
    check(parentDefects.length === 0, `Unexpected parent defects #${source.id}`);
    const originalDeductions = await run(conn,
      "SELECT deduction_type_id,hours FROM production_temp_deductions WHERE temp_report_id=?", [source.id]);
    const aggregate = (items) => {
      const result = new Map();
      for (const d of items)
        result.set(num(d.deduction_type_id), (result.get(num(d.deduction_type_id)) || 0) + num(d.hours));
      return result;
    };
    const fromParent = aggregate(originalDeductions);
    const fromLines = aggregate(lines.flatMap(l => json(l.deductions_json, [])));
    check(fromParent.size === fromLines.size &&
      [...fromParent].every(([id,hours]) => Math.abs(hours - (fromLines.get(id) ?? -100)) <= 0.0002),
      `Deduction mismatch #${source.id}`);
    const keys = lines.map(line => requestKey(source.id, line.id));
    const prior = await run(conn,
      `SELECT id FROM production_reports_temp WHERE worker_id=? AND client_request_id IN (${keys.map(() => "?").join(",")})`,
      [source.worker, ...keys]);
    check(prior.length === 0, `Child reports already exist for #${source.id}`);
    groups.push({ source, parent, lines });
  }
  return groups;
}

async function repair(conn, groups) {
  const created = [];
  for (const { source, parent, lines } of groups) {
    const newIds = [];
    for (const line of lines) {
      const requestId = requestKey(source.id, line.id);
      const extra = {
        ...json(parent.extra_data, {}),
        legacy_split_from_report_id: source.id,
        legacy_split_from_machine_line_id: num(line.id),
        repair_tag: "mai-pending-split-20261115",
      };
      const logicalKey = crypto.createHash("sha256").update(requestId).digest("hex");
      const net = num(line.machine_time_hours) - num(line.deduction_time_hours);
      const insert = await run(conn,
        `INSERT INTO production_reports_temp
        (worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,
         machine_no,product_name,total_time,actual_time,deduction_time,standard_output,
         standard_version_id,machine_standard_id,training_percent_snapshot,
         exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,note,extra_data,
         client_request_id,logical_duplicate_key,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        [parent.worker_id,parent.process_id,parent.work_date,parent.entry_date,parent.shift,
         parent.operation_type,parent.operation_mode,line.machine_code,line.product_code,
         num(line.machine_time_hours),net,num(line.deduction_time_hours),
         num(line.standard_output),line.standard_version_id,line.machine_standard_id,
         parent.training_percent_snapshot,line.exclude_kqd_from_tt,
         num(line.counted_output),num(line.ok_quantity),num(line.ng_quantity),
         parent.note,JSON.stringify(extra),requestId,logicalKey]);
      const id = num(insert.insertId);
      check(Number.isInteger(id) && id > 0, `Insert failed for line #${line.id}`);
      const copied = await run(conn,
        `INSERT INTO production_temp_machine_lines
        (temp_report_id,machine_event_id,machine_id,machine_code,product_standard_id,
         standard_version_id,machine_standard_id,product_code,machine_time_hours,
         standard_output,standard_time_seconds,standard_source,exclude_kqd_from_tt,
         ok_quantity,ng_quantity,maximum_output,deduction_time_hours,deductions_json,
         counted_output,earned_standard_hours,defects_json,sort_order,
         adjustment_minutes,adjustment_count)
        SELECT ?,machine_event_id,machine_id,machine_code,product_standard_id,
         standard_version_id,machine_standard_id,product_code,machine_time_hours,
         standard_output,standard_time_seconds,standard_source,exclude_kqd_from_tt,
         ok_quantity,ng_quantity,maximum_output,deduction_time_hours,deductions_json,
         counted_output,earned_standard_hours,defects_json,1,
         adjustment_minutes,adjustment_count
        FROM production_temp_machine_lines WHERE id=? AND temp_report_id=?`,
        [id,line.id,source.id]);
      check(num(copied.affectedRows) === 1, `Copy failed for line #${line.id}`);
      for (const deduction of json(line.deductions_json, [])) {
        await run(conn,
          "INSERT INTO production_temp_deductions (temp_report_id,deduction_type_id,hours) VALUES (?,?,?)",
          [id,num(deduction.deduction_type_id),Number(num(deduction.hours).toFixed(4))]);
      }
      created.push({ id, source: source.id, line: num(line.id), ok: num(line.ok_quantity) });
      newIds.push(id);
    }
    const result = await run(conn,
      "UPDATE production_reports_temp SET status='rejected',review_note=? WHERE id=? AND status='pending'",
      [`Replaced by independently reviewable MAI reports: ${newIds.join(", ")}. Original retained for audit.`,source.id]);
    check(num(result.affectedRows) === 1, `Source transition failed #${source.id}`);
  }
  const ids = created.map(item => item.id);
  check(created.length === 4 && created.reduce((sum,item) => sum + item.ok,0) === 6573,
    "Output conservation failed");
  const reports = await run(conn,
    `SELECT id,status,tt_ok FROM production_reports_temp WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  const children = await run(conn,
    `SELECT temp_report_id,COUNT(*) AS cnt,SUM(ok_quantity) AS ok_quantity
     FROM production_temp_machine_lines WHERE temp_report_id IN (${ids.map(() => "?").join(",")})
     GROUP BY temp_report_id`, ids);
  check(reports.length === 4 && reports.every(r => r.status === "pending") &&
    children.length === 4 && children.every(r => num(r.cnt) === 1) &&
    children.reduce((sum,r) => sum + num(r.ok_quantity),0) === 6573,
    "Post-insert verification failed");
  return created;
}

(async () => {
  const conn = await db.promise().getConnection();
  let active = false;
  try {
    if (APPLY) { await conn.beginTransaction(); active = true; }
    const groups = await preflight(conn, APPLY);
    console.log(JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY_RUN",
      sources: groups.map(g => ({report: g.source.id, lines: g.lines.map(l => ({
        line: l.id, machine: l.machine_code, product: l.product_code,
        hours: num(l.machine_time_hours), deducted: num(l.deduction_time_hours),
        ok: num(l.ok_quantity) }))}))
    }, null, 2));
    if (!APPLY) return;
    const created = await repair(conn, groups);
    await conn.commit(); active = false;
    console.log("COMMITTED:", JSON.stringify(created));
  } catch (error) {
    if (active) await conn.rollback();
    console.error("FAILED (no changes committed):", error.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    if (typeof db.closePool === "function") await db.closePool();
    else await db.promise().end();
  }
})();
