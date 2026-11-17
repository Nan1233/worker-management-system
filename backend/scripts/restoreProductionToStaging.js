
'use strict';

require('dotenv').config();

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const readline = require('node:readline');
const mysql = require('mysql2/promise');

const TARGET = 'worker_management_restore_verify_20261117';
const SOURCE = 'worker_management';
const BACKUP = String.raw`F:\KTC_DB_Backup_Source\ktc-db-20261117-165522.jsonl.gz.enc`;

const quote = name => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('INVALID_IDENTIFIER');
  }
  return `\`${name}\``;
};

async function main() {
  const e = process.env;

  if (e.DB_NAME !== SOURCE) {
    throw new Error('SOURCE_ENV_MISMATCH');
  }

  if (!e.KTC_BACKUP_ENCRYPTION_KEY) {
    throw new Error('BACKUP_KEY_REQUIRED');
  }

  if (!e.KTC_RESTORE_DB_HOST ||
      !e.KTC_RESTORE_DB_USER ||
      !e.KTC_RESTORE_DB_PASSWORD) {
    throw new Error('RESTORE_CONNECTION_MISSING');
  }

  const { verifyBackupArtifact } =
    require('../services/disasterBackupArtifactService');

  const artifact = await verifyBackupArtifact(BACKUP);

  if (!artifact.success ||
      artifact.database !== SOURCE ||
      artifact.tableCount !== 132 ||
      artifact.rowCount !== 43809) {
    throw new Error('BACKUP_VERIFICATION_FAILED');
  }

  const meta = JSON.parse(
    await fsp.readFile(BACKUP + '.crypto.json', 'utf8')
  );

  const key = crypto.scryptSync(
    e.KTC_BACKUP_ENCRYPTION_KEY,
    Buffer.from(meta.salt, 'base64'),
    32
  );

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(meta.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(meta.auth_tag, 'base64'));

  const admin = await mysql.createConnection({
    host: e.KTC_RESTORE_DB_HOST,
    port: Number(e.KTC_RESTORE_DB_PORT || 4000),
    user: e.KTC_RESTORE_DB_USER,
    password: e.KTC_RESTORE_DB_PASSWORD,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    },
    timezone: 'Z',
    dateStrings: true
  });

  let targetCreated = false;

  try {
    const [existing] = await admin.query(
      `SELECT SCHEMA_NAME
       FROM information_schema.SCHEMATA
       WHERE SCHEMA_NAME = ?`,
      [TARGET]
    );

    if (existing.length) {
      throw new Error('TARGET_ALREADY_EXISTS');
    }

    console.log('Backup verified:', artifact.tableCount,
      'tables,', artifact.rowCount, 'rows');

    console.log('Creating staging database:', TARGET);

    await admin.query(
      `CREATE DATABASE ${quote(TARGET)}
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    targetCreated = true;

    await admin.changeUser({ database: TARGET });

    const [[selected]] = await admin.query(
      'SELECT DATABASE() AS db'
    );

    if (selected.db !== TARGET) {
      throw new Error('UNSAFE_DATABASE_SELECTED');
    }

    const input = fs.createReadStream(BACKUP)
      .pipe(decipher)
      .pipe(zlib.createGunzip());

    const lines = readline.createInterface({
      input,
      crlfDelay: Infinity
    });

    const schemas = new Map();
    const expected = new Map();
    const actual = new Map();
    const generated = new Map();
    const dateTypes = new Map();

    let prepared = false;
    let currentTable = null;
    let batch = [];

    async function flush() {
      if (!batch.length) return;

      const table = currentTable;
      const excluded = generated.get(table) || new Set();

      const columns = Object.keys(batch[0])
        .filter(c => !excluded.has(c));

      if (!columns.length) {
        throw new Error('NO_INSERTABLE_COLUMNS:' + table);
      }

      const sql =
        `INSERT INTO ${quote(table)} (` +
        columns.map(quote).join(',') +
        ') VALUES ' +
        batch.map(() =>
          '(' + columns.map(() => '?').join(',') + ')'
        ).join(',');

      const values = batch.flatMap(row =>
  columns.map(c => {
    const value = row[c];
    if (value === null || value === undefined) return null;

    const type = dateTypes.get(table)?.get(c);

    if (type === 'date' && typeof value === 'string') {
      return value.slice(0, 10);
    }

    if (
      (type === 'datetime' || type === 'timestamp') &&
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value)
    ) {
      return value
        .replace('T', ' ')
        .replace(/Z$/, '')
        .slice(0, 23);
    }

    return value;
  })
);

      await admin.query(sql, values);

      actual.set(table,
        (actual.get(table) || 0) + batch.length
      );

      batch = [];

    }

    async function prepare() {
      if (prepared) return;

      if (schemas.size !== 132) {
        throw new Error('SCHEMA_COUNT_MISMATCH');
      }

      for (const [table, createSql] of schemas) {
        if (!/^CREATE TABLE\s+`?[a-zA-Z0-9_]+`?\s*\(/i.test(createSql)) {
          throw new Error('UNSAFE_CREATE_SQL:' + table);
        }

        await admin.query(createSql);
      }

      const [columns] = await admin.query(
        `SELECT TABLE_NAME, COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND (
             EXTRA LIKE '%VIRTUAL GENERATED%'
             OR EXTRA LIKE '%STORED GENERATED%'
           )`,
        [TARGET]
      );

      for (const c of columns) {
        if (!generated.has(c.TABLE_NAME)) {
          generated.set(c.TABLE_NAME, new Set());
        }
        generated.get(c.TABLE_NAME).add(c.COLUMN_NAME);
      }

      console.log('Tables created:', schemas.size);
      console.log('Generated columns excluded:', columns.length);

      prepared = true;
      const [dateColumns] = await admin.query(`
  SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = ?
    AND DATA_TYPE IN ('date', 'datetime', 'timestamp')
`, [TARGET]);

for (const c of dateColumns) {
  if (!dateTypes.has(c.TABLE_NAME)) {
    dateTypes.set(c.TABLE_NAME, new Map());
  }

  dateTypes.get(c.TABLE_NAME).set(
    c.COLUMN_NAME,
    c.DATA_TYPE
  );
}
    }

    for await (const line of lines) {
      if (!line.trim()) continue;

      const item = JSON.parse(line);

      if (item.type === 'schema') {
        if (prepared) throw new Error('LATE_SCHEMA');
        if (schemas.has(item.table)) {
          throw new Error('DUPLICATE_SCHEMA');
        }
        schemas.set(item.table, item.create_sql);
        continue;
      }

      if (item.type === 'row') {
        await prepare();

        if (!schemas.has(item.table)) {
          throw new Error('UNKNOWN_TABLE:' + item.table);
        }

        if (currentTable && currentTable !== item.table) {
          await flush();
        }

        currentTable = item.table;
        batch.push(item.data);

        expected.set(item.table,
          (expected.get(item.table) || 0) + 1
        );

        if (batch.length >= 100) {
          await flush();
        }
      }
    }

    await prepare();
    await flush();

    let total = 0;

    for (const table of schemas.keys()) {
      const [[result]] = await admin.query(
        `SELECT COUNT(*) AS total FROM ${quote(table)}`
      );

      const count = Number(result.total);
      const wanted = expected.get(table) || 0;

      if (count !== wanted) {
        throw new Error(
          `ROW_COUNT_MISMATCH:${table}:${count}:${wanted}`
        );
      }

      total += count;
    }

    if (total !== artifact.rowCount) {
      throw new Error('TOTAL_ROW_COUNT_MISMATCH');
    }

    console.log('RESTORE SUCCESS');
    console.log('Database:', TARGET);
    console.log('Tables:', schemas.size);
    console.log('Rows:', total);
    console.log('Production and test were not modified.');

  } catch (err) {
    console.error('RESTORE FAILED:', err.message);

    if (targetCreated) {
      console.error(
        'Staging database may be partially restored. ' +
        'Do not use it until verified.'
      );
    }

    throw err;
  } finally {
    await admin.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
