'use strict';

// Infrastructure adapter for backend Excel export response metadata.
// Keep content-disposition precedence and process field fallbacks unchanged.
function parseDownloadFileName(response, fallback) {
  const value = response.headers.get('content-disposition') || '';
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const normal = value.match(/filename="?([^";]+)"?/i)?.[1];
  const encoded = utf8 || normal;
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

function normalizeProcessInfo(row) {
  return {
    ...row,
    id: Number(row?.id ?? row?.processId ?? row?.process_id),
    processCode: row?.processCode ?? row?.process_code ?? row?.code ?? '',
    processName: row?.processName ?? row?.process_name ?? row?.name ?? row?.title ?? ''
  };
}

module.exports = { parseDownloadFileName, normalizeProcessInfo };
