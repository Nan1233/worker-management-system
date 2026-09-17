const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "../src/pages/worker/WorkerReportEdit.tsx");
const source = fs.readFileSync(file, "utf8");

const needle = `const hm = toHoursMinutes(number(line.machine_time_hours));\n      return { ...createEmptyMachineLine(), machineCode:`;
const replacement = `const hm = toHoursMinutes(number(line.machine_time_hours));\n      const selectedDefects: string[] = [];\n      const defects: Record<string, string> = {};\n      (line.defects || []).forEach((item: any) => {\n        const key = findNgKey(item);\n        if (key) {\n          selectedDefects.push(key);\n          defects[key] = String(item.quantity || 0);\n        }\n      });\n      return { ...createEmptyMachineLine(), selectedDefects, defects, machineCode:`;

if (source.includes(replacement)) {
  console.log("[KTC] WorkerReportEdit NG preservation patch already present.");
  process.exit(0);
}

if (!source.includes(needle)) {
  console.log("[KTC] WorkerReportEdit NG preservation patch target not found; leaving source unchanged.");
  process.exit(0);
}

fs.writeFileSync(file, source.replace(needle, replacement), "utf8");
console.log("[KTC] WorkerReportEdit now preserves machine-level NG details during initialization.");
