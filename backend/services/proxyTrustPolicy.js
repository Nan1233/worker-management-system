function resolveTrustProxySetting(env = process.env) {
  const explicit = String(env.KTC_TRUST_PROXY_HOPS || '').trim();
  if (explicit) {
    if (!/^\d+$/.test(explicit)) throw Object.assign(new Error('KTC_TRUST_PROXY_HOPS must be an integer'), { code: 'TRUST_PROXY_CONFIG_INVALID' });
    const hops = Number(explicit);
    if (hops < 0 || hops > 3) throw Object.assign(new Error('KTC_TRUST_PROXY_HOPS out of allowed range 0..3'), { code: 'TRUST_PROXY_CONFIG_INVALID' });
    return hops === 0 ? false : hops;
  }
  // Render terminates public traffic at its reverse proxy before the service.
  if (env.RENDER || env.RENDER_SERVICE_ID) return 1;
  return false;
}

module.exports = { resolveTrustProxySetting };
