const fs = require("node:fs");
const path = require("node:path");

const DIST = path.resolve(__dirname, "../dist");
const VERSION = "1.9.14";
const LEGACY_VERSIONS = ["1.5.0", "1.8.20", "1.8.21", "1.8.22"];

if (!fs.existsSync(DIST)) {
  throw new Error("frontend/dist không tồn tại sau vite build");
}

let changedFiles = 0;
let replacements = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html|json|map)$/.test(entry.name)) {
      const original = fs.readFileSync(full, "utf8");
      let updated = original;
      for (const legacy of LEGACY_VERSIONS) {
        const re = new RegExp(legacy.replace(/\./g, "\\."), "g");
        const matches = updated.match(re);
        if (matches) replacements += matches.length;
        updated = updated.replace(re, VERSION);
      }
      if (updated !== original) {
        fs.writeFileSync(full, updated, "utf8");
        changedFiles += 1;
      }
    }
  }
}

walk(DIST);
console.log(`[KTC] frontend production version forced to ${VERSION}; files=${changedFiles}, replacements=${replacements}`);
