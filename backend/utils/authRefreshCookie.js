'use strict';
const REFRESH_TOKEN_TTL_DAYS=Math.max(1,Number(process.env.REFRESH_TOKEN_TTL_DAYS||90));
const REFRESH_COOKIE_NAME = "ktc_refresh_token";

function parseCookie(req, name) {
    const cookieHeader = String(req.headers.cookie || "");
    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim();
        if (key !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return part.slice(separator + 1).trim();
        }
    }
    return "";
}

function getRequestRefreshToken(req) {
    const bodyToken = typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken.trim()
        : "";
    return bodyToken || parseCookie(req, REFRESH_COOKIE_NAME);
}

// The SPA and API live on different sites in deployment (Render / workers.dev), so the refresh
// cookie must be Secure + SameSite=None there. On a Cloudflare Worker NODE_ENV is not guaranteed
// to be populated, so the Worker runtime is treated as a cross-site HTTPS deployment too.
function isCrossSiteCookieRuntime() {
    return process.env.NODE_ENV === "production"
        || process.env.KTC_CLOUDFLARE_WORKER === "true"
        || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
}

function refreshCookieBaseOptions() {
    const crossSite = isCrossSiteCookieRuntime();
    return {
        httpOnly: true,
        secure: crossSite,
        sameSite: crossSite ? "none" : "lax",
        path: "/api/auth",
    };
}

function setRefreshCookie(res, refreshToken, expiresAt = null) {
    const absoluteExpiry = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const remainingMs = Number.isFinite(absoluteExpiry)
        ? Math.max(0, absoluteExpiry - Date.now())
        : REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...refreshCookieBaseOptions(), maxAge: remainingMs });
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBaseOptions());
}

function shouldReturnRefreshToken(req) {
    // Compatibility discriminator only, NOT client authentication: arbitrary HTTP
    // clients can spoof both User-Agent and Origin. Never use this predicate to
    // bypass account/role/password checks. Electron retains a body-token fallback
    // because file:// cookie behavior varies; HTTP(S) browser origins stay cookie-only.
    const userAgent = String(req.headers["user-agent"] || "");
    const origin = String(req.headers.origin || "").trim().toLowerCase();
    const isOpaqueNativeOrigin = !origin || origin === "null" || origin.startsWith("file:");
    return /electron/i.test(userAgent) && isOpaqueNativeOrigin;
}

module.exports={REFRESH_COOKIE_NAME,parseCookie,getRequestRefreshToken,setRefreshCookie,clearRefreshCookie,shouldReturnRefreshToken};
