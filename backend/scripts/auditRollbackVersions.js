#!/usr/bin/env node
const { auditRollbackVersions } = require('../services/rollbackVersionAuditService');

async function main() {
  const findings = await auditRollbackVersions();
  const summary = findings.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {});
  process.stdout.write(`${JSON.stringify({
    scanner: 'rollback_versions',
    read_only: true,
    summary,
    findings
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error('[KTC] rollback version audit failed:', error?.message || error);
    process.exit(1);
  });
}

module.exports = { main };
