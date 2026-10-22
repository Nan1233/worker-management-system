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

/**
 * Today's calendar date in Vietnam (YYYY-MM-DD) regardless of the server's TZ. Factories report in
 * Asia/Ho_Chi_Minh while Render/Cloudflare run in UTC, so `new Date().setHours(0,0,0,0)` was the
 * previous UTC day between 00:00 and 07:00 Vietnam time.
 */
function getVietnamDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = { toDateKey, getVietnamDateKey };
