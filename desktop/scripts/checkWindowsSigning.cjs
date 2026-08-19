const required = ["CSC_LINK", "CSC_KEY_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`[KTC] Windows release signing is not configured: missing ${missing.join(", ")}`);
  console.error("[KTC] Do not distribute an unsigned EXE as an official release.");
  process.exit(1);
}
console.log("[KTC] Windows release signing configuration detected.");
console.log("[KTC] electron-builder will use SHA-256 signing.");
