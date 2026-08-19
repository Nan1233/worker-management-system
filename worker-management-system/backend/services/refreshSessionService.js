'use strict';

const crypto = require('node:crypto');
const { hashRefreshToken } = require('../utils/refreshTokenHash');

class RefreshSessionError extends Error {
  constructor(code, message, status = 401) {
    super(message || code);
    this.name = 'RefreshSessionError';
    this.code = code;
    this.status = status;
  }
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateFamilyId() {
  return crypto.randomUUID();
}

function getDefaultPool() {
  // Lazy load keeps pure/unit tests independent from mysql2 installation.
  return require('../config/db');
}

function toSqlDateTime(value) {
  if (typeof value === 'string') return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RefreshSessionError('REFRESH_TOKEN_INVALID', 'Invalid session expiry');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isExpired(value, now = new Date()) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return !Number.isFinite(time) || time <= now.getTime();
}

async function query(executor, sql, params = []) {
  const result = await executor.query(sql, params);
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

async function createFamilyRoot(data, options = {}) {
  const executor = options.executor || getDefaultPool().promise();
  const familyId = data.family_id || generateFamilyId();
  const rawToken = data.refresh_token || generateRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  if (!tokenHash) throw new RefreshSessionError('REFRESH_TOKEN_INVALID', 'Missing refresh token');

  const sql = `
    INSERT INTO user_sessions (
      user_id, refresh_token, family_id,
      device_id, device_name, user_agent, ip_address,
      expires_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  const result = await executor.query(sql, [
    data.user_id,
    tokenHash,
    familyId,
    data.device_id || generateFamilyId(),
    data.device_name || null,
    data.user_agent || null,
    data.ip_address || null,
    toSqlDateTime(data.expires_at),
  ]);
  const packet = Array.isArray(result) ? result[0] : result;
  return {
    sessionId: Number(packet?.insertId || 0) || null,
    familyId,
    refreshToken: rawToken,
    refreshTokenHash: tokenHash,
    expiresAt: toSqlDateTime(data.expires_at),
  };
}

async function findGenerationForUpdate(connection, refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const rows = await query(connection, `
    SELECT
      id, user_id, refresh_token, family_id,
      device_id, device_name, user_agent, ip_address,
      expires_at, revoked_at, consumed_at, replaced_by_id,
      reuse_detected_at, last_used_at, created_at
    FROM user_sessions
    WHERE refresh_token IN (?, ?)
    ORDER BY CASE WHEN refresh_token = ? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
    FOR UPDATE
  `, [tokenHash, String(refreshToken || '').trim(), tokenHash]);
  return rows[0] || null;
}

async function loadCurrentUser(connection, userId) {
  const rows = await query(connection, `
    SELECT
      u.id AS user_id, u.username, u.full_name, u.role, u.status,
      w.id AS worker_id, w.worker_code, w.status AS worker_status
    FROM users u
    LEFT JOIN workers w ON w.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

async function revokeFamilyWithExecutor(executor, familyId, { reuseGenerationId = null } = {}) {
  if (!familyId) return { affectedRows: 0 };
  if (reuseGenerationId) {
    await executor.query(
      `UPDATE user_sessions SET reuse_detected_at=COALESCE(reuse_detected_at, NOW()) WHERE id=?`,
      [reuseGenerationId],
    );
  }
  const result = await executor.query(
    `UPDATE user_sessions SET revoked_at=COALESCE(revoked_at, NOW()) WHERE family_id=?`,
    [familyId],
  );
  return Array.isArray(result) ? result[0] : result;
}

async function rotateRefreshToken({ refreshToken, userAgent = null, ipAddress = null }, options = {}) {
  const pool = options.pool || getDefaultPool();
  const connection = options.connection || await pool.promise().getConnection();
  const ownsConnection = !options.connection;
  let committedSecurityDenial = null;
  try {
    await connection.beginTransaction();
    const generation = await findGenerationForUpdate(connection, refreshToken);
    if (!generation) {
      throw new RefreshSessionError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    if (!generation.family_id) {
      // Legacy rows never gain fabricated lineage. Revoke the row and require re-login.
      await connection.query(
        `UPDATE user_sessions SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=?`,
        [generation.id],
      );
      await connection.commit();
      committedSecurityDenial = new RefreshSessionError('REFRESH_TOKEN_RELOGIN_REQUIRED', 'Legacy session requires re-login');
      throw committedSecurityDenial;
    }
    if (generation.refresh_token !== tokenHash) {
      throw new RefreshSessionError('REFRESH_TOKEN_RELOGIN_REQUIRED', 'Legacy raw refresh session is not rotatable');
    }

    if (generation.consumed_at || generation.replaced_by_id) {
      await revokeFamilyWithExecutor(connection, generation.family_id, { reuseGenerationId: generation.id });
      await connection.commit();
      committedSecurityDenial = new RefreshSessionError('REFRESH_TOKEN_REUSE_DETECTED', 'Consumed refresh token was reused');
      throw committedSecurityDenial;
    }
    if (generation.revoked_at) {
      throw new RefreshSessionError('REFRESH_TOKEN_REVOKED', 'Refresh token is revoked');
    }
    if (isExpired(generation.expires_at, options.now || new Date())) {
      throw new RefreshSessionError('REFRESH_TOKEN_EXPIRED', 'Refresh token is expired');
    }

    const user = await loadCurrentUser(connection, generation.user_id);
    const userInactive = !user || user.status !== 'active';
    const workerInactive = user?.role === 'worker' && user.worker_status !== 'active';
    if (userInactive || workerInactive) {
      await revokeFamilyWithExecutor(connection, generation.family_id);
      await connection.commit();
      committedSecurityDenial = new RefreshSessionError('SESSION_USER_DISABLED', 'Session user is disabled', 403);
      throw committedSecurityDenial;
    }

    const successorToken = options.successorToken || generateRefreshToken();
    const successorHash = hashRefreshToken(successorToken);
    const insertResult = await connection.query(`
      INSERT INTO user_sessions (
        user_id, refresh_token, family_id,
        device_id, device_name, user_agent, ip_address,
        expires_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      generation.user_id,
      successorHash,
      generation.family_id,
      generation.device_id,
      generation.device_name,
      userAgent || generation.user_agent || null,
      ipAddress || generation.ip_address || null,
      toSqlDateTime(generation.expires_at),
    ]);
    const successorId = Number((Array.isArray(insertResult) ? insertResult[0] : insertResult)?.insertId || 0);
    if (!successorId) throw new Error('REFRESH_SUCCESSOR_INSERT_FAILED');

    const consumeResult = await connection.query(`
      UPDATE user_sessions
      SET consumed_at=NOW(), replaced_by_id=?, last_used_at=NOW()
      WHERE id=? AND consumed_at IS NULL AND replaced_by_id IS NULL AND revoked_at IS NULL
    `, [successorId, generation.id]);
    const consumePacket = Array.isArray(consumeResult) ? consumeResult[0] : consumeResult;
    if (Number(consumePacket?.affectedRows || 0) !== 1) {
      throw new RefreshSessionError('REFRESH_TOKEN_REUSE_DETECTED', 'Refresh generation was already consumed');
    }

    await connection.commit();
    return {
      refreshToken: successorToken,
      refreshTokenHash: successorHash,
      familyId: generation.family_id,
      expiresAt: toSqlDateTime(generation.expires_at),
      user,
      previousSessionId: Number(generation.id),
      sessionId: successorId,
    };
  } catch (error) {
    if (error !== committedSecurityDenial) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function resolveFamilyByToken(refreshToken, executor) {
  const tokenHash = hashRefreshToken(refreshToken);
  const rows = await query(executor, `
    SELECT id, user_id, family_id, refresh_token, revoked_at, consumed_at
    FROM user_sessions
    WHERE refresh_token IN (?, ?)
    ORDER BY CASE WHEN refresh_token=? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `, [tokenHash, String(refreshToken || '').trim(), tokenHash]);
  return rows[0] || null;
}

async function revokeFamilyByRefreshToken(refreshToken, options = {}) {
  const executor = options.executor || getDefaultPool().promise();
  const generation = await resolveFamilyByToken(refreshToken, executor);
  if (!generation) return { found: false, familyId: null };
  if (generation.family_id) {
    await revokeFamilyWithExecutor(executor, generation.family_id);
    return { found: true, familyId: generation.family_id };
  }
  await executor.query(`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=?`, [generation.id]);
  return { found: true, familyId: null, legacy: true };
}

async function revokeAllUserFamilies(userId, options = {}) {
  const executor = options.executor || getDefaultPool().promise();
  const result = await executor.query(
    `UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=? AND revoked_at IS NULL`,
    [userId],
  );
  return Array.isArray(result) ? result[0] : result;
}

module.exports = {
  RefreshSessionError,
  generateRefreshToken,
  generateFamilyId,
  isExpired,
  createFamilyRoot,
  rotateRefreshToken,
  revokeFamilyByRefreshToken,
  revokeAllUserFamilies,
  _test: {
    toSqlDateTime,
    findGenerationForUpdate,
    loadCurrentUser,
    revokeFamilyWithExecutor,
  },
};
