'use strict';

// Master data and reports for the Excel layer. Names come from the repository's
// own sources so the tests follow them, not a hand-made list:
//   * 16 GC deductions: backend/config/ktcTemplateMasterData.js (same as migration 053)
//   * 19 GC defects:    backend/migrations/048_gc_products_defects_from_excel_20260924.sql

const fs = require('node:fs');
const path = require('node:path');
const config = require('../lib/config.cjs');

const master = require(path.join(config.ROOT, 'backend', 'config', 'ktcTemplateMasterData.js'));
const processes = (master.KTC_TEMPLATE_MASTER_DATA || master.default || master).processes || master;

const GC_DEDUCTION_NAMES = processes.GC.deductions.slice();

function readMigrationDefects() {
  const sql = fs.readFileSync(path.join(config.ROOT, 'backend', 'migrations', '048_gc_products_defects_from_excel_20260924.sql'), 'utf8');
  const insert = sql.split('\n').find((line) => /INSERT INTO defect_types/i.test(line)) || '';
  return [...insert.matchAll(/\(@gc_process_id,'([^']+)','([^']+)',(\d+),'active'\)/g)]
    .map(([, code, name, order]) => ({ code, name, order: Number(order) }));
}

const GC_DB_DEFECTS = readMigrationDefects();

const deductionTypes = GC_DEDUCTION_NAMES.map((name, i) => ({ id: 100 + i, deduction_code: `GC_D${i + 1}`, deduction_name: name }));
const defectTypes = GC_DB_DEFECTS.map((item, i) => ({ id: 500 + i, defect_code: item.code, defect_name: item.name }));

const dedByName = (name) => {
  const type = deductionTypes.find((t) => t.deduction_name === name);
  if (!type) throw new Error(`unknown GC deduction ${name}`);
  return type;
};
const defByCode = (code) => {
  const type = defectTypes.find((t) => t.defect_code === code);
  if (!type) throw new Error(`unknown GC defect ${code}`);
  return type;
};
const ded = (name, hours) => ({ deduction_type_id: dedByName(name).id, deduction_name: name, hours });
const def = (code, quantity) => ({ defect_type_id: defByCode(code).id, defect_code: code, defect_name: defByCode(code).defect_name, quantity });

/**
 * One approved GC report with two machine lines, numbers chosen so that nothing
 * coincides between the lines. The report-level aggregates are deliberately
 * wrong so a row that copies them instead of using its own line is caught.
 */
function twoMachineReport(overrides = {}) {
  return {
    id: 9001, work_date: '2026-09-03', worker_code: '4310', full_name: 'Công nhân E2E', shift: 'A', training_percent: 100,
    operation_mode: 'MACHINE', total_time: 99, actual_time: 99, deduction_time: 99,
    deductions: [ded('Mất điện', 7)],
    defects: [def('CUT_2', 777)],
    machineLines: [
      {
        id: 1, sort_order: 1, machine_code: '5', product_code: 'E2E-5770', machine_time_hours: 4.5, standard_output: 600,
        deduction_time_hours: 0.5, deductions_json: JSON.stringify([ded('Nghỉ giải lao', 0.5)]),
        ok_quantity: 100, ng_quantity: 5, defects: [def('CUT_1', 5)]
      },
      {
        id: 2, sort_order: 2, machine_code: '6', product_code: 'E2E-9116', machine_time_hours: 6, standard_output: 300,
        deduction_time_hours: 1, deductions_json: JSON.stringify([ded('Chờ hàng', 0.75), ded('5s', 0.25)]),
        ok_quantity: 240, ng_quantity: 12, defects: [def('LONG_2', 7), def('XOAY', 5)]
      }
    ],
    ...overrides
  };
}

function manualReport(overrides = {}) {
  return {
    id: 9002, work_date: '2026-09-03', worker_code: '947', full_name: 'Làm tay E2E', shift: 'C', training_percent: 100,
    operation_mode: 'MANUAL', total_time: 8, actual_time: 7.25, deduction_time: 0.75, standard_output: 120,
    product_name: 'E2E-TAY', tt_ok: 800, tt_ng: 9,
    deductions: [ded('Giao ca', 0.5), ded('5s', 0.25)],
    defects: [def('LONG_5', 4), def('CUT_6', 5)],
    machineLines: [],
    ...overrides
  };
}

module.exports = { GC_DEDUCTION_NAMES, GC_DB_DEFECTS, deductionTypes, defectTypes, ded, def, twoMachineReport, manualReport };
