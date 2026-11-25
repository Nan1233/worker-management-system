'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { incomingDailyWorkHours } = require('../services/productionDailyHoursCalculation');

// Independent reference from the pre-refactor create-model implementation.
// This is a compatibility oracle, not an alternative runtime path.
function legacyLockedIncomingHours(data, machineLines, processCode) {
    const isParallelMachineProcess = processCode === 'GC' || processCode === 'MAI';
    return isParallelMachineProcess && machineLines.length
        ? (() => {
            const netHoursByMachine = new Map();
            for (const line of machineLines) {
                const machine = String(line?.machine_code || line?.machine_id || '').trim().toUpperCase() || '__UNKNOWN__';
                const net = Math.max(0, (Number(line?.machine_time_hours ?? line?.actual_time_hours) || 0)
                    - (Number(line?.deduction_time_hours ?? line?.deduction_time ?? 0) || 0));
                netHoursByMachine.set(machine, (netHoursByMachine.get(machine) || 0) + net);
            }
            return Math.max(0, ...netHoursByMachine.values());
        })()
        : (Number(data?.actual_time) || 0);
}

const scenarios = [
    ['GC split machines', 'GC', { actual_time: 2 }, [
        { machine_code: 'C5', machine_time_hours: 5, deduction_time_hours: 1 },
        { machine_code: 'C6', machine_time_hours: 7, deduction_time_hours: 1 },
    ]],
    ['GC two products on one machine', 'GC', { actual_time: 1 }, [
        { machine_code: 'C5', actual_time_hours: 2, deduction_time_hours: 0 },
        { machine_code: 'c5', actual_time_hours: 3, deduction_time_hours: 1 },
    ]],
    ['MAI multiple lines, no deduction', 'MAI', { actual_time: 3 }, [
        { machine_code: 'M01', machine_time_hours: 3 },
        { machine_code: 'M02', machine_time_hours: 4 },
    ]],
    ['MAI deduction fallback', 'MAI', { actual_time: 3 }, [
        { machine_id: 12, actual_time_hours: 4, deduction_time: 1 },
        { machine_id: 12, actual_time_hours: 2, deduction_time_hours: 0.5 },
    ]],
    ['zero-clamped machine time', 'GC', { actual_time: 1 }, [
        { machine_code: 'C7', actual_time_hours: 1, deduction_time_hours: 4 },
    ]],
    ['unknown machine fallback grouping', 'GC', { actual_time: 8 }, [
        { actual_time_hours: 2 }, { actual_time_hours: 3 },
    ]],
    ['manual process ignores lines', 'K1', { actual_time: 6 }, [
        { machine_code: 'C5', actual_time_hours: 12 },
    ]],
    ['no machine lines', 'GC', { actual_time: 5.5 }, []],
    ['null numeric entries', 'GC', { actual_time: 3 }, [
        { machine_code: 'C11', actual_time_hours: null, deduction_time_hours: null },
    ]],
    ['same physical machine uppercase and spaces', 'GC', { actual_time: 2 }, [
        { machine_code: '  c11  ', machine_time_hours: 4, deduction_time_hours: 0.5 },
        { machine_code: 'C11', machine_time_hours: 2, deduction_time_hours: 0.25 },
    ]],
];
for (const [title, code, data, lines] of scenarios) {
    test('locked creation hours parity: ' + title, () => {
        assert.equal(incomingDailyWorkHours(data, lines, code), legacyLockedIncomingHours(data, lines, code));
    });
}

test('locked submission uses shared hours calculation after worker row lock', () => {
    const model = fs.readFileSync(path.join(__dirname, '../models/productionTempCreateModel.js'), 'utf8');
    const lock = model.indexOf('SELECT id FROM workers WHERE id=? FOR UPDATE');
    const calculate = model.indexOf('const incoming = incomingDailyWorkHours(data, machineLines, processCode)');
    const check = model.indexOf('const projected = existing + incoming');
    assert.ok(lock >= 0 && calculate > lock && check > calculate);
    assert.match(model, /require\("\.\.\/services\/productionDailyHoursCalculation"\)/);
    assert.match(model, /if \(data\?\._skip_daily_hours_enforcement === true\) return/);
    assert.match(model, /DAILY_WORKING_HOURS_LIMIT_EXCEEDED/);
});

test('standard/training snapshots and physical event aggregation remain separate', () => {
    const standard = fs.readFileSync(path.join(__dirname, '../services/standardResolutionService.js'), 'utf8');
    const training = fs.readFileSync(path.join(__dirname, '../services/trainingSnapshotService.js'), 'utf8');
    const machine = fs.readFileSync(path.join(__dirname, '../services/giaCongMachineAccounting.js'), 'utf8');
    assert.match(standard, /STANDARD_EFFECTIVE_RANGE_CONFLICT/);
    const policy=fs.readFileSync(path.join(__dirname,'../domain/standardSnapshotPolicy.js'),'utf8');
    assert.match(standard,/assertStandardSnapshotConsistency/);
    assert.match(policy, /STANDARD_SNAPSHOT_MISMATCH/);
    assert.match(training, /TRAINING_SNAPSHOT_MISSING/);
    assert.match(machine, /seenEvents = new Set\(\)/);
    assert.match(machine, /addGiaCongPhysicalMachineHours/);
});
