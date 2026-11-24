'use strict';

// Shared, environment-independent primitives for backend calculations and
// Desktop Excel snapshots. The engines intentionally retain separate rules
// for approved database snapshots versus editable report calculations.
const DEFAULT_SETTINGS = Object.freeze({
  apply_training_percent: 1,
  output_formula: 'ENTERED_X_TRAINING',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
  actual_time_formula: 'DATABASE_SNAPSHOT'
});

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function asInteger(value) {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
}

function normalizeTrainingPercent(value, defaultPercent = 100) {
  if (value === null || value === undefined) return defaultPercent;
  if (typeof value === 'string' && value.trim() === '') return defaultPercent;
  const number = asNumber(value);
  if (number === null) return defaultPercent;
  return Math.min(100, Math.max(0, number));
}

function trainingFactor(value, defaultPercent = 100) {
  return normalizeTrainingPercent(value, defaultPercent) / 100;
}

// Historical snapshots must not be clamped or replaced with current master data.
function parseStoredTrainingSnapshot(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function safeRatio(numerator, denominator) {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  const n = asNumber(numerator);
  const d = asNumber(denominator);
  return n !== null && n >= 0 && d !== null && d > 0 ? n / d : null;
}

// Net participation hours are distinct from physical machine hours.
function calculateNetHours(gross, deduction = 0) {
  const hours = asNumber(gross);
  const excluded = asNumber(deduction);
  if (hours === null || excluded === null) return null;
  return Math.max(0, Math.max(0, hours) - Math.max(0, excluded));
}

// Factor is explicit: physical capacity uses 1, training targets use the snapshot factor.
function calculatePlannedOutput(standard, hours, factor = 1) {
  const rate = asNumber(standard);
  const time = asNumber(hours);
  const multiplier = asNumber(factor);
  if ([rate, time, multiplier].some(value => value === null || value < 0)) return null;
  return rate * time * multiplier;
}

module.exports = {
  calculateNetHours,
  calculatePlannedOutput,
  parseStoredTrainingSnapshot,
  safeRatio,
  DEFAULT_SETTINGS,
  asNumber,
  asInteger,
  normalizeTrainingPercent,
  trainingFactor
};
