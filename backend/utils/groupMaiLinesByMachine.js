const sumLineNumber = (lines, field) => lines.reduce((sum, line) => sum + (Number(line?.[field]) || 0), 0);

// Mài may record several products on one physical machine. Preserve every
// product line as detail while producing one parent report per machine.
const groupMaiLinesByMachine = (machineLines = []) => {
    const groups = new Map();
    for (const line of machineLines) {
        const machineCode = String(line?.machine_code || "").trim();
        const key = machineCode.toUpperCase();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(line);
    }
    return [...groups.values()].map((lines) => {
        const first = lines[0];
        return {
            ...first,
            machine_code: String(first.machine_code || "").trim(),
            product_code: [...new Set(lines.map((line) => String(line?.product_code || "").trim()).filter(Boolean))].join(", "),
            machine_time_hours: sumLineNumber(lines, "machine_time_hours"),
            deduction_time_hours: sumLineNumber(lines, "deduction_time_hours"),
            standard_output: sumLineNumber(lines, "standard_output"),
            counted_output: sumLineNumber(lines, "counted_output"),
            ok_quantity: sumLineNumber(lines, "ok_quantity"),
            ng_quantity: sumLineNumber(lines, "ng_quantity"),
            earned_standard_hours: sumLineNumber(lines, "earned_standard_hours"),
            defects: lines.flatMap((line) => Array.isArray(line?.defects) ? line.defects : []),
            deductions: lines.flatMap((line) => Array.isArray(line?.deductions) ? line.deductions : []),
            _source_machine_lines: lines
        };
    });
};

module.exports = { groupMaiLinesByMachine };
