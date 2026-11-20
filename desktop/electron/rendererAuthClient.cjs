'use strict';

// Token acquisition, refresh and retry policy for the trusted Electron renderer.
function createRendererAuthClient({
  getWindow, getCurrentToken, setCurrentToken, normalizeAccessToken,
  isUsableAccessToken, isRetrySafeMethod, fetchWithTimeout, writeLog, normalizeError,
  sendRenderer, wait, RETRY_COUNT, RETRY_DELAY_MS,
}) {
async function readRendererAccessToken() {
  const mainWindow = getWindow();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return '';

  const token = await mainWindow.webContents.executeJavaScript(
    `(() => {
      try {
        // The hosted Cloudflare frontend uses sessionStorage for accessToken.
        // In Electron remote-profile mode localStorage is deliberately cleared.
        const keys = ['accessToken', 'access_token', 'token'];
        for (const storage of [sessionStorage, localStorage]) {
          for (const key of keys) {
            const value = storage.getItem(key);
            if (typeof value === 'string' && value.trim()) return value.trim();
          }
          const authValue = storage.getItem('auth');
          if (!authValue) continue;
          try {
            const auth = JSON.parse(authValue);
            const nested = auth?.accessToken || auth?.access_token || auth?.token || '';
            if (typeof nested === 'string' && nested.trim()) return nested.trim();
          } catch {
            // Invalid legacy auth JSON is not a token; continue lookup.
          }
        }
        return '';
      } catch {
        return '';
      }
    })()`,
    true
  );
  return normalizeAccessToken(token);
}

async function resolveDesktopToken(candidateToken) {
  // Renderer là nguồn ưu tiên vì frontend cập nhật localStorage ngay sau /auth/refresh.
  const supplied = normalizeAccessToken(candidateToken);
  if (isUsableAccessToken(supplied)) return supplied;

  // Renderer navigation, reload or an offline page can make executeJavaScript
  // reject. Keep the last valid token available rather than failing IPC.
  let rendererToken = '';
  try {
    rendererToken = await readRendererAccessToken();
  } catch (error) {
    await writeLog('WARN', 'RENDERER_TOKEN_READ_FAILED', normalizeError(error));
  }
  if (isUsableAccessToken(rendererToken)) return normalizeAccessToken(rendererToken);

  const cached = normalizeAccessToken(getCurrentToken());
  if (isUsableAccessToken(cached)) return cached;
  return '';
}

async function waitForUsableRendererToken(candidateToken = '', timeoutMs = 8_000, options = {}) {
  const supplied = normalizeAccessToken(candidateToken);
  const previous = options.previousToken ? normalizeAccessToken(options.previousToken) : '';
  // Manual IPC requests carry the currently authenticated frontend token.
  // Use it immediately instead of polling the renderer for eight seconds.
  if (!previous && isUsableAccessToken(supplied)) return supplied;
  const deadline = Date.now() + timeoutMs;
  do {
    const token = await resolveDesktopToken('');
    if (token && token !== previous && isUsableAccessToken(token)) return token;
    if (Date.now() >= deadline) break;
    await wait(250);
  } while (true);
  const fallback = await resolveDesktopToken('');
  return fallback && fallback !== previous && isUsableAccessToken(fallback) ? fallback : '';
}

async function authenticatedFetch(url, options = {}) {
  const requestMethod = String(options.method || 'GET').toUpperCase();
  const retrySafe = isRetrySafeMethod(requestMethod);
  const execute = async (token) => fetchWithTimeout(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  let token = await waitForUsableRendererToken('', 8_000);
  if (!token) {
    throw new Error('Không tìm thấy phiên đăng nhập hợp lệ. Hãy chờ đăng nhập được làm mới rồi thử lại.');
  }
  setCurrentToken(token);

  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      let response = await execute(token);
      if (response.status === 401) {
        await writeLog('WARN', 'AUTH_TOKEN_401_WAITING_FOR_REFRESH', { url, attempt });
        sendRenderer('ktc-auth-refresh-required', { reason: 'excel-request-401' });
        const refreshed = await waitForUsableRendererToken('', 10_000, { previousToken: token });
        if (refreshed && refreshed !== token) {
          token = refreshed;
          setCurrentToken(refreshed);
          await writeLog('INFO', 'AUTH_TOKEN_REFRESHED_FOR_EXCEL', { url, attempt });
          response = await execute(refreshed);
        }
      }

      const retryableStatus = retrySafe && [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryableStatus || attempt === RETRY_COUNT) return response;

      await writeLog('WARN', 'API_RETRYABLE_RESPONSE', {
        url, status: response.status, attempt, maxAttempts: RETRY_COUNT
      });
      await wait(RETRY_DELAY_MS * attempt);
    } catch (error) {
      lastError = error;
      await writeLog('WARN', 'API_FETCH_RETRY', {
        url, attempt, maxAttempts: RETRY_COUNT, ...normalizeError(error)
      });
      if (!retrySafe || attempt === RETRY_COUNT) throw error;
      await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error('Không thể kết nối backend KTC.');
}


  return { readRendererAccessToken, resolveDesktopToken, waitForUsableRendererToken, authenticatedFetch };
}
module.exports = { createRendererAuthClient };
