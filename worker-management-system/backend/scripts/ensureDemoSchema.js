'use strict';

const db = require('../config/db');
const AuditService = require('../services/auditService');
const FormulaSettingsService = require('../services/formulaSettingsService');
const GovernanceSchemaService = require('../services/governanceSchemaService');

async function main() {
  const database = await db.testConnection();
  console.log(`[KTC] DB connected: ${database.host}:${database.port}; SSL=${database.ssl}`);

  await AuditService.ensureSchema();
  console.log('[KTC] Audit/version schema OK');

  await GovernanceSchemaService.ensureSchema();
  console.log('[KTC] Governance schema OK');

  await FormulaSettingsService.ensureSchema();
  console.log('[KTC] Formula scope/time schema OK');

  console.log('[KTC] Demo schema ready');
}

main()
  .catch((error) => {
    console.error('[KTC] Demo schema failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
