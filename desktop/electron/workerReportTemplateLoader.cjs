'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { TEMPLATE_NAME } = require('./workerReportTemplateRegistry.cjs');

// Cache the source worker template only; copies are instantiated by the workbook builder.
let cachedTemplatePath = '';
let cachedTemplateBuffer = null;

function templateCandidates(appPath) {
  const candidates = [
    path.resolve(appPath || process.cwd(), '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(appPath || process.cwd(), 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(__dirname, '..', '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'backend', 'templates', TEMPLATE_NAME)
  ];
  if (process.resourcesPath) candidates.unshift(path.join(process.resourcesPath, 'templates', TEMPLATE_NAME));
  return [...new Set(candidates)];
}
async function resolveTemplatePath(appPath) {
  for (const candidate of templateCandidates(appPath)) {
    try { await fs.access(candidate); return candidate; } catch (_) {}
  }
  throw Object.assign(new Error(`Không tìm thấy template ${TEMPLATE_NAME}`), { code: 'KTC_WORKER_TEMPLATE_MISSING' });
}
async function getTemplateBuffer(appPath) {
  const templatePath = await resolveTemplatePath(appPath);
  if (cachedTemplateBuffer && cachedTemplatePath === templatePath) return { templatePath, buffer: cachedTemplateBuffer };
  cachedTemplatePath = templatePath;
  cachedTemplateBuffer = await fs.readFile(templatePath);
  return { templatePath, buffer: cachedTemplateBuffer };
}


module.exports = { templateCandidates, resolveTemplatePath, getTemplateBuffer };
