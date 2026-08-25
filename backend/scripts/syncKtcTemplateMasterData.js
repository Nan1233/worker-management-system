#!/usr/bin/env node
const mysql = require('mysql2/promise');
const template = require('../config/ktcTemplateMasterData');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const codeFor = (prefix, index) => `KTC_${prefix}_${String(index + 1).padStart(3, '0')}`;

async function syncType(db, table, processId, names, codePrefix) {
  const target = names.map((name, index) => ({ name, normalized: normalize(name), sortOrder: index + 1, code: codeFor(codePrefix, index) }));
  const targetNames = new Set(target.map((x) => x.normalized));
  const [existing] = await db.execute(`SELECT id, ${table === 'defect_types' ? 'defect_code' : 'deduction_code'} AS item_code, ${table === 'defect_types' ? 'defect_name' : 'deduction_name'} AS item_name, status FROM ${table} WHERE process_id = ? ORDER BY id`, [processId]);

  const byName = new Map();
  for (const row of existing) {
    const key = normalize(row.item_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  for (const item of target) {
    const matches = byName.get(item.normalized) || [];
    const keep = matches[0];
    if (keep) {
      await db.execute(
        `UPDATE ${table} SET sort_order = ?, status = 'active' WHERE id = ?`,
        [item.sortOrder, keep.id],
      );
      for (const duplicate of matches.slice(1)) {
        await db.execute(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`, [duplicate.id]);
      }
    } else if (table === 'defect_types') {
      await db.execute(
        `INSERT INTO defect_types(process_id, defect_code, defect_name, sort_order, status) VALUES(?,?,?,?, 'active')`,
        [processId, item.code, item.name, item.sortOrder],
      );
    } else {
      await db.execute(
        `INSERT INTO deduction_types(process_id, deduction_code, deduction_name, sort_order, status) VALUES(?,?,?,?, 'active')`,
        [processId, item.code, item.name, item.sortOrder],
      );
    }
  }

  // Keep historical rows, but ensure the active master exactly matches the Excel template.
  for (const row of existing) {
    if (!targetNames.has(normalize(row.item_name))) {
      await db.execute(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`, [row.id]);
    }
  }
}

async function main() {
  if (process.env.KTC_ALLOW_TEMPLATE_MASTER_SYNC !== '1') {
    throw new Error('Set KTC_ALLOW_TEMPLATE_MASTER_SYNC=1 to run the Excel master sync.');
  }

  const db = await mysql.createConnection(cfg);
  try {
    for (const [processCode, config] of Object.entries(template)) {
      await db.execute(`UPDATE processes SET status = 'active' WHERE id = ?`, [config.id]);

      const defects = processCode === 'SX3'
        ? [...config.defects_machine, ...config.defects_ng_part]
        : (config.defects || []);

      await syncType(db, 'defect_types', config.id, defects, `DEF_${processCode}`);
      await syncType(db, 'deduction_types', config.id, config.deductions || [], `DED_${processCode}`);
    }
  } finally {
    await db.end();
  }

  console.log('KTC_TEMPLATE_MASTER_SYNC_OK');
  for (const [code, config] of Object.entries(template)) {
    const defects = code === 'SX3' ? config.defects_machine.length + config.defects_ng_part.length : config.defects.length;
    console.log(`${code}: defects=${defects}, deductions=${config.deductions.length}`);
  }
}

main().catch((error) => {
  console.error('KTC_TEMPLATE_MASTER_SYNC_FAIL', error.message);
  process.exit(1);
});
