'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CANONICAL_SCHEMA_PATH = path.join(__dirname, '../database/KTC_FULL_DATABASE_CANONICAL_20260817.sql');
const CONTRACT_VERSION = 26;

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim();
  v = v.replace(/^DEFAULT\s+/i, '').trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1).replace(/''/g, "'");
  }
  return v.toUpperCase() === 'NULL' ? null : v;
}

function parseColumnDefinition(definition) {
  if (/^(PRIMARY|UNIQUE|KEY|CONSTRAINT|FULLTEXT|SPATIAL)\b/i.test(definition.trim())) return null;
  const match = /^`?([A-Za-z0-9_]+)`?\s+([A-Za-z]+(?:\s+UNSIGNED)?(?:\s*\([^)]*\))?)([\s\S]*)$/i.exec(definition.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const type = match[2].replace(/\s+/g, ' ').trim().toLowerCase();
  const rest = match[3] || '';
  const nullable = !/\bNOT\s+NULL\b/i.test(rest);
  const defaultMatch = /\bDEFAULT\s+((?:'[^']*(?:''[^']*)*')|(?:"[^"]*")|[^\s,]+)/i.exec(rest);
  const extra = [
    /\bAUTO_INCREMENT\b/i.test(rest) ? 'auto_increment' : '',
    /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i.test(rest) ? 'on_update_current_timestamp' : '',
  ].filter(Boolean).join(',');
  return { name, type, nullable, default: normalizeDefault(defaultMatch ? defaultMatch[1] : null), extra };
}

function parseIndexDefinition(definition) {
  const text = definition.trim();
  let match = /^PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(text);
  if (match) return { name: 'PRIMARY', unique: true, columns: splitTopLevel(match[1]).map(s => s.trim().replace(/^`|`$/g, '').toLowerCase()) };
  match = /^(UNIQUE\s+)?KEY\s+`?([A-Za-z0-9_]+)`?\s*\(([^)]*)\)/i.exec(text);
  if (!match) return null;
  return {
    name: match[2].toLowerCase(),
    unique: Boolean(match[1]),
    columns: splitTopLevel(match[3]).map(s => s.trim().replace(/^`|`$/g, '').toLowerCase()),
  };
}

function loadCanonicalSchema() {
  const sql = stripSqlComments(fs.readFileSync(CANONICAL_SCHEMA_PATH, 'utf8'));
  const tables = {};
  const tableRegex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?\s*\(([\s\S]*?)\)\s*;/gi;
  let match;
  while ((match = tableRegex.exec(sql))) {
    const tableName = match[1].toLowerCase();
    const definitions = splitTopLevel(match[2]);
    const columns = {};
    const indexes = {};
    for (const definition of definitions) {
      const column = parseColumnDefinition(definition);
      if (column) { columns[column.name] = column; continue; }
      const index = parseIndexDefinition(definition);
      if (index) indexes[index.name] = index;
    }
    tables[tableName] = { columns, indexes };
  }
  return Object.freeze({ tables, version: CONTRACT_VERSION, source: path.relative(process.cwd(), CANONICAL_SCHEMA_PATH) });
}

let cached;
function getCanonicalSchema() {
  if (!cached) cached = loadCanonicalSchema();
  return cached;
}

function compareColumn(expected, actual) {
  const diffs = [];
  if (String(actual.COLUMN_TYPE || '').toLowerCase() !== expected.type) diffs.push(`type=${actual.COLUMN_TYPE || 'NULL'} expected=${expected.type}`);
  const nullable = String(actual.IS_NULLABLE || '').toUpperCase() === 'YES';
  if (nullable !== expected.nullable) diffs.push(`nullable=${nullable} expected=${expected.nullable}`);
  const actualDefault = normalizeDefault(actual.COLUMN_DEFAULT);
  if (actualDefault !== expected.default) diffs.push(`default=${actualDefault ?? 'NULL'} expected=${expected.default ?? 'NULL'}`);
  const actualExtra = String(actual.EXTRA || '').toLowerCase();
  if (expected.extra.includes('auto_increment') !== actualExtra.includes('auto_increment')) diffs.push(`auto_increment=${actualExtra.includes('auto_increment')} expected=${expected.extra.includes('auto_increment')}`);
  return diffs;
}

function compareIndex(expected, rows) {
  if (!rows.length) return ['missing'];
  const columns = rows.sort((a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX)).map(r => String(r.COLUMN_NAME).toLowerCase());
  const unique = Number(rows[0].NON_UNIQUE) === 0;
  const diffs = [];
  if (unique !== expected.unique) diffs.push(`unique=${unique} expected=${expected.unique}`);
  if (JSON.stringify(columns) !== JSON.stringify(expected.columns)) diffs.push(`columns=${columns.join(',')} expected=${expected.columns.join(',')}`);
  return diffs;
}

module.exports = { CANONICAL_SCHEMA_PATH, CONTRACT_VERSION, getCanonicalSchema, compareColumn, compareIndex, normalizeDefault };
