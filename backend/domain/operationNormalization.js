'use strict';

// Canonical production operation aliases shared by HTTP and application layers.
// No Express, database or network dependencies.
const normalizeOperationType = (value) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    const aliases = {
        CUT: 'CUT', CAT: 'CUT', 'CẮT': 'CUT',
        NEST: 'NEST', NESTING: 'NEST', LONG: 'NEST', 'LỒNG': 'NEST',
    };
    return aliases[normalized] || null;
};

const normalizeOperationMode = (value) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    const aliases = {
        MANUAL: 'MANUAL', TAY: 'MANUAL',
        MACHINE: 'MACHINE', MAY: 'MACHINE', 'MÁY': 'MACHINE',
    };
    return aliases[normalized] || null;
};

module.exports = { normalizeOperationType, normalizeOperationMode };
