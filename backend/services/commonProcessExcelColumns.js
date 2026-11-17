'use strict';

// Column positions are part of the legacy Excel template contract.
// Keep these values shared by row builders, worksheet formatting and writers.
const MAX_DEDUCTIONS = 15;
const MAX_DEFECTS = 16;
const LAST_COLUMN = 53;
const PRODUCT_COLUMN = 27;
const DATE_COLUMN = 31;
const NG_RATE_COLUMN = 35;

module.exports = { MAX_DEDUCTIONS, MAX_DEFECTS, LAST_COLUMN, PRODUCT_COLUMN, DATE_COLUMN, NG_RATE_COLUMN };
