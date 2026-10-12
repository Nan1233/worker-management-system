#!/usr/bin/env node
'use strict';

// Focused Mài master-data sync. Safe by default: read-only dry run.
// Apply only against the TEST database with:
//   KTC_DB_ENV=TEST KTC_ALLOW_MAI_MASTER_SYNC=1 node backend/scripts/syncMaiMasterData.js --apply
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const template = require('../config/ktcTemplateMasterData');

const PROCESS_CODE = 'MAI';
const config = template[PROCESS_CODE];
if (!config || Number(config.id) !== 2) {
  throw new Error('Unexpected Mài master configuration; refusing to run.');
}

const apply = process.argv.includes('--apply');
if (process.argv.some((arg) => arg.startsWith('--') && arg !== '--apply' && arg !== '--dry-run')) {
  throw new Error('Supported flags: --dry-run (default), --apply');
}
if (apply && (process.env.KTC_DB_ENV !== 'TEST' || process.env.KTC_ALLOW_MAI_MASTER_SYNC !== '1')) {
  throw new Error('Apply is blocked. Set KTC_DB_ENV=TEST and KTC_ALLOW_MAI_MASTER_SYNC=1 explicitly.');
}

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 10000,
};

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tableMeta(table) {
  if (table === 'defect_types') {
    return { code: 'defect_code', name: 'defect_name', prefix: 'KTC_MAI_DEF' };
  }
  if (table === 'deduction_types') {
    return { code: 'deduction_code', name: 'deduction_name', prefix: 'KTC_MAI_DED' };
  }
  throw new Error('Unsupported master table');
}

async function syncType(db, table, names) {
  const meta = tableMeta(table);
  const [existing] = await db.execute(
    `SELECT id, ${meta.code} AS item_code, ${meta.name} AS item_name, status, sort_order
       FROM ${table} WHERE process_id = ? ORDER BY id`,
    [Number(config.id)]
  );
  const grouped = new Map();
  for (const row of existing) {
    const key = normalize(row.item_name);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const desiredKeys = new Set();
  const actions = [];
  for (const [index, name] of names.entries()) {
    const key = normalize(name);
    if (!key || desiredKeys.has(key)) throw new Error(`Duplicate/empty target label in ${table}: ${name}`);
    desiredKeys.add(key);
    const matches = grouped.get(key) || [];
    const keep = matches[0];
    if (keep) {
      actions.push({ kind: 'activate', table, id: keep.id, label: keep.item_name, sortOrder: index + 1 });
      for (const duplicate of matches.slice(1)) {
        actions.push({ kind: 'deactivate', table, id: duplicate.id, label: duplicate.item_name });
      }
    } else {
      actions.push({ kind: 'insert', table, code: `${meta.prefix}_${String(index + 1).padStart(3, '0')}`, label: name, sortOrder: index + 1 });
    }
  }

  for (const row of existing) {
    if (!desiredKeys.has(normalize(row.item_name))) {
      actions.push({ kind: 'deactivate', table, id: row.id, label: row.item_name });
    }
  }

  for (const action of actions) {
    console.log(JSON.stringify(action));
    if (!apply) continue;
    if (action.kind === 'activate') {
      await db.execute(
        `UPDATE ${table} SET status = 'active', sort_order = ? WHERE id = ?`,
        [action.sortOrder, action.id]
      );
    } else if (action.kind === 'deactivate') {
      await db.execute(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`, [action.id]);
    } else if (action.kind === 'insert' && table === 'defect_types') {
      await db.execute(
        `INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status) VALUES (?, ?, ?, ?, 'active')`,
        [Number(config.id), action.code, action.label, action.sortOrder]
      );
    } else if (action.kind === 'insert') {
      await db.execute(
        `INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status) VALUES (?, ?, ?, ?, 'active')`,
        [Number(config.id), action.code, action.label, action.sortOrder]
      );
    }
  }
}

async function main() {
  if (!dbConfig.user || !dbConfig.password || !dbConfig.database) {
    throw new Error('DB_USER, DB_PASSWORD, and DB_NAME must be provided via environment variables.');
  }
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', dbHost: dbConfig.host, dbPort: dbConfig.port, dbName: dbConfig.database, processId: Number(config.id), processCode: PROCESS_CODE }));
  const db = await mysql.createConnection(dbConfig);
  try {
    const [processRows] = await db.execute(
      'SELECT id, process_code, process_name FROM processes WHERE id = ? LIMIT 1',
      [Number(config.id)]
    );
    const process = processRows[0];
    if (!process || normalize(process.process_code) !== 'mai' || normalize(process.process_name) !== 'mai') {
      throw new Error('Database process id=2 is not confirmed as Mài; refusing to continue.');
    }

    if (apply) await db.beginTransaction();
    try {
      await syncType(db, 'deduction_types', config.deductions || []);
      await syncType(db, 'defect_types', config.defects || []);

      if (apply) {
        for (const [table, expected] of [['deduction_types', 11], ['defect_types', 7]]) {
          const [rows] = await db.execute(
            `SELECT COUNT(*) AS total FROM ${table} WHERE process_id = ? AND status = 'active'`,
            [Number(config.id)]
          );
          if (Number(rows[0]?.total) !== expected) {
            throw new Error(`Post-sync verification failed for ${table}: expected ${expected}, got ${rows[0]?.total}`);
          }
        }
        await db.commit();
        console.log('MAI_MASTER_SYNC_APPLIED_AND_VERIFIED');
      } else {
        console.log('DRY_RUN_ONLY_NO_ROWS_CHANGED');
      }
    } catch (error) {
      if (apply) await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('MAI_MASTER_SYNC_FAILED:', error.message);
  process.exitCode = 1;
});
