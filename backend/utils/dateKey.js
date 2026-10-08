'use strict';

/**
 * YYYY-MM-DD for a DATE column value. mysql2 returns DATE columns as JS Date
 * objects at local midnight, so String(date).slice(0, 10) yields "Wed Oct 07";
 * read the local calendar fields instead (same approach as report approval).
 */
function toDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value ?? '').slice(0, 10);
}

module.exports = { toDateKey };
