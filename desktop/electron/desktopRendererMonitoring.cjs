'use strict';

// Renderer token polling and approved-mutation telemetry; no automatic DB write.
function createDesktopRendererMonitoring({
  readRendererAccessToken, isUsableAccessToken, getCurrentToken,
  configureAutomaticSync, writeLog, normalizeError, getMainWindow,
  stopExcelDbSyncWatcher,
}) {
  let tokenDiscoveryTimer = null;
  let lastApprovedMutationAt = 0;

async function discoverRendererToken() {
  try {
    const normalized = await readRendererAccessToken();
    // An empty storage read is not proof of logout: the remote frontend may
    // be reloading or refreshing its auth state. Never erase a valid token
    // mid-export. Expiry is still enforced by isUsableAccessToken.
    if (!normalized && isUsableAccessToken(getCurrentToken())) return getCurrentToken();
    if (normalized !== getCurrentToken()) {
      configureAutomaticSync(normalized);
      await writeLog('INFO', normalized ? 'TOKEN_DISCOVERED_AUTO_SYNC_ENABLED' : 'TOKEN_REMOVED_AUTO_SYNC_DISABLED');
    }
    return normalized;
  } catch (error) {
    await writeLog('WARN', 'TOKEN_DISCOVERY_FAILED', normalizeError(error));
    return '';
  }
}

function startTokenDiscovery() {
  if (tokenDiscoveryTimer) clearInterval(tokenDiscoveryTimer);
  stopExcelDbSyncWatcher();
  void discoverRendererToken();
  // Avoid continuously executing JavaScript against the renderer while it is
  // loading or the user is interacting with the application.
  tokenDiscoveryTimer = setInterval(() => {
    const activeWindow = getMainWindow();
    if (!activeWindow || activeWindow.isDestroyed() || activeWindow.webContents.isLoading()) return;
    void discoverRendererToken();
  }, 15000);
  tokenDiscoveryTimer.unref?.();
}

function scheduleSyncAfterApprovedMutation(url, statusCode) {
  if (statusCode < 200 || statusCode >= 300) return;
  const lower = String(url || '').toLowerCase();
  const changesApprovedData = lower.includes('/production-temp/approve')
    || lower.includes('/production/approve')
    || (lower.includes('/production/') && (lower.includes('/update') || lower.includes('/reports')));
  if (!changesApprovedData) return;
  const now = Date.now();
  if (now - lastApprovedMutationAt < 1500) return;
  lastApprovedMutationAt = now;
  void writeLog('INFO', 'APPROVED_MUTATION_AUTO_SYNC_SKIPPED', { url: lower });
}


function stopTokenDiscovery() {
  if (tokenDiscoveryTimer) clearInterval(tokenDiscoveryTimer);
  tokenDiscoveryTimer = null;
}
return { startTokenDiscovery, stopTokenDiscovery, scheduleSyncAfterApprovedMutation };
}
module.exports = { createDesktopRendererMonitoring };
