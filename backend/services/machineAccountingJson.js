'use strict';

// Machine accounting accepts stored JSON and already-decoded arrays.
// Malformed or non-array values are treated as empty details, as before.
const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

module.exports = { parseJsonArray };
