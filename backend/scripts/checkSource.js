const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const roots = ["config", "controllers", "middleware", "models", "routes", "services", "utils"];
const files = ["server.js", "worker.js"];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) collect(root);
}

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}
console.log(`Syntax OK: ${files.length} JavaScript files`);
