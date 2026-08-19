'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { sha256File } = require('../scripts/backup/backupUtils');

const SUPPORTED_FORMAT = 'KTC_DB_JSONL_GZIP_V1';

function artifactError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

async function readJson(file, code) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch (error) { throw artifactError(code, `Không thể đọc metadata backup: ${path.basename(file)}`, error); }
}

async function createDecodedStream(file, encryptionSecret = '') {
  let input;
  try { input = fs.createReadStream(file); }
  catch (error) { throw artifactError('BACKUP_FILE_UNREADABLE', 'Không thể mở backup', error); }
  if (file.endsWith('.enc')) {
    if (!encryptionSecret) throw artifactError('BACKUP_ENCRYPTION_KEY_REQUIRED', 'Backup mã hóa nhưng thiếu khóa giải mã');
    const meta = await readJson(`${file}.crypto.json`, 'BACKUP_CRYPTO_METADATA_INVALID');
    try {
      const key = crypto.scryptSync(encryptionSecret, Buffer.from(meta.salt, 'base64'), 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(meta.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(meta.auth_tag, 'base64'));
      input = input.pipe(decipher);
    } catch (error) {
      throw artifactError('BACKUP_DECRYPTION_FAILED', 'Không thể khởi tạo giải mã backup', error);
    }
  }
  return input.pipe(zlib.createGunzip());
}

async function verifyBackupArtifact(filePath, { encryptionSecret = process.env.KTC_BACKUP_ENCRYPTION_KEY || '' } = {}) {
  const file = path.resolve(filePath || '');
  if (!filePath) throw artifactError('BACKUP_FILE_REQUIRED', 'Thiếu file backup');

  let expectedText;
  try { expectedText = await fsp.readFile(`${file}.sha256`, 'utf8'); }
  catch (error) { throw artifactError('BACKUP_CHECKSUM_MISSING', 'Thiếu checksum sidecar', error); }
  const expected = String(expectedText).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected)) throw artifactError('BACKUP_CHECKSUM_INVALID', 'Checksum sidecar không hợp lệ');
  const actual = await sha256File(file).catch((error) => { throw artifactError('BACKUP_FILE_UNREADABLE', 'Không thể hash backup', error); });
  if (expected.toLowerCase() !== actual.toLowerCase()) throw artifactError('BACKUP_CHECKSUM_MISMATCH', 'Checksum backup không khớp');

  const manifest = await readJson(`${file}.manifest.json`, 'BACKUP_MANIFEST_INVALID');
  if (manifest.sha256 && String(manifest.sha256).toLowerCase() !== actual.toLowerCase()) {
    throw artifactError('BACKUP_MANIFEST_CHECKSUM_MISMATCH', 'Manifest checksum không khớp backup');
  }
  if (manifest.format !== SUPPORTED_FORMAT) {
    throw artifactError('BACKUP_VERSION_UNSUPPORTED', `Backup format không hỗ trợ: ${String(manifest.format || 'missing')}`);
  }
  if (!manifest.created_at || !manifest.tables || typeof manifest.tables !== 'object' || Array.isArray(manifest.tables)) {
    throw artifactError('BACKUP_MANIFEST_INVALID', 'Manifest thiếu created_at/tables hợp lệ');
  }

  const schemas = new Set();
  const endedTables = new Set();
  const rowCounts = new Map();
  let meta = null;
  let end = null;
  let endCount = 0;
  let lineNo = 0;
  let stream;
  try { stream = await createDecodedStream(file, encryptionSecret); }
  catch (error) { throw error; }
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      lineNo += 1;
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); }
      catch (error) { throw artifactError('BACKUP_RECORD_MALFORMED', `JSONL malformed at line ${lineNo}`, error); }
      if (!item || typeof item !== 'object' || typeof item.type !== 'string') {
        throw artifactError('BACKUP_RECORD_MALFORMED', `Record thiếu type tại line ${lineNo}`);
      }
      if (item.type === 'meta') {
        if (meta) throw artifactError('BACKUP_DUPLICATE_SECTION', 'Backup có nhiều meta record');
        meta = item;
        if (item.format !== SUPPORTED_FORMAT) throw artifactError('BACKUP_VERSION_UNSUPPORTED', `Backup stream format không hỗ trợ: ${String(item.format || 'missing')}`);
      } else if (item.type === 'schema') {
        const table = String(item.table || '');
        if (!table || !item.create_sql) throw artifactError('BACKUP_SCHEMA_INVALID', `Schema record không hợp lệ tại line ${lineNo}`);
        if (schemas.has(table)) throw artifactError('BACKUP_DUPLICATE_SECTION', `Duplicate schema section: ${table}`);
        schemas.add(table);
      } else if (item.type === 'row') {
        const table = String(item.table || '');
        if (!table || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
          throw artifactError('BACKUP_RECORD_MALFORMED', `Row record không hợp lệ tại line ${lineNo}`);
        }
        if (!schemas.has(table)) throw artifactError('BACKUP_SCHEMA_INVALID', `Row xuất hiện trước/không có schema: ${table}`);
        rowCounts.set(table, (rowCounts.get(table) || 0) + 1);
      } else if (item.type === 'table_end') {
        const table = String(item.table || '');
        if (!schemas.has(table) || endedTables.has(table)) throw artifactError('BACKUP_DUPLICATE_SECTION', `table_end không hợp lệ: ${table}`);
        if (Number(item.rows || 0) !== Number(rowCounts.get(table) || 0)) throw artifactError('BACKUP_ROW_COUNT_MISMATCH', `table_end row count mismatch: ${table}`);
        endedTables.add(table);
      } else if (item.type === 'end') {
        endCount += 1;
        end = item;
      } else {
        throw artifactError('BACKUP_RECORD_UNSUPPORTED', `Record type không hỗ trợ: ${item.type}`);
      }
    }
  } catch (error) {
    if (error.code) throw error;
    throw artifactError('BACKUP_STREAM_INVALID', 'Backup gzip/decrypt stream không hợp lệ hoặc bị cắt', error);
  }

  if (!meta) throw artifactError('BACKUP_META_MISSING', 'Backup thiếu meta record');
  if (endCount !== 1 || !end) throw artifactError('BACKUP_END_MARKER_INVALID', 'Backup thiếu hoặc có nhiều end marker');
  const manifestTables = Object.keys(manifest.tables).sort();
  const schemaTables = [...schemas].sort();
  if (manifestTables.join('\0') !== schemaTables.join('\0')) throw artifactError('BACKUP_SCHEMA_MISMATCH', 'Manifest tables không khớp schema sections');
  for (const table of manifestTables) {
    if (!endedTables.has(table)) throw artifactError('BACKUP_TABLE_END_MISSING', `Thiếu table_end: ${table}`);
    const expectedRows = Number(manifest.tables[table]?.rows || 0);
    const actualRows = Number(rowCounts.get(table) || 0);
    if (expectedRows !== actualRows) throw artifactError('BACKUP_ROW_COUNT_MISMATCH', `${table}: ${actualRows} != ${expectedRows}`);
    if (Number(end.tables?.[table]?.rows ?? -1) !== expectedRows) throw artifactError('BACKUP_END_MANIFEST_MISMATCH', `end marker mismatch: ${table}`);
  }

  return {
    success: true,
    format: SUPPORTED_FORMAT,
    file,
    sha256: actual,
    createdAt: manifest.created_at,
    database: manifest.database || meta.database || null,
    tableCount: manifestTables.length,
    rowCount: [...rowCounts.values()].reduce((a, b) => a + b, 0),
    tables: manifest.tables,
    metadata: {
      appVersion: manifest.app_version || meta.app_version || null,
      dbVersion: manifest.db_version || meta.db_version || null,
      encrypted: Boolean(manifest.encrypted),
    },
  };
}

module.exports = { SUPPORTED_FORMAT, verifyBackupArtifact, artifactError };
