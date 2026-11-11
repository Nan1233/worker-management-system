'use strict';

// Historical Excel payloads may contain an array or an object with a defects
// array. Keep both formats supported; invalid JSON is an empty detail list.
const parseExcelDetailArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.defects)) return parsed.defects;
  } catch (_error) {
    // Preserve the saved line totals when historical details are malformed.
  }
  return [];
};

module.exports = { parseExcelDetailArray };
