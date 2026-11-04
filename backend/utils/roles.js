'use strict';

// Role model. `super_admin` is stored in users.role. For authorization it behaves exactly like
// `admin` (every existing admin check, route guard and permission applies unchanged), plus the
// `is_super_admin` flag that only the privileged super-admin operations check.
// The flag is always derived from the database row, never from the JWT or the request body.
const SUPER_ADMIN_ROLE = 'super_admin';

const normalizeRoleName = (role) => String(role ?? '').trim().toLowerCase();
const isSuperAdminRole = (role) => normalizeRoleName(role) === SUPER_ADMIN_ROLE;
/** Role used by all authorization checks: super_admin -> admin. */
const effectiveRole = (role) => (isSuperAdminRole(role) ? 'admin' : normalizeRoleName(role));
/** Request actor is a super admin (set by the auth middlewares from the DB row). */
const isSuperAdminActor = (actor) => Boolean(actor && actor.is_super_admin === true);
/** Fields added to user objects returned to clients and stored in JWT/auth cache. */
const publicRoleFields = (dbRole) => ({ role: effectiveRole(dbRole), is_super_admin: isSuperAdminRole(dbRole) });

module.exports = { SUPER_ADMIN_ROLE, normalizeRoleName, isSuperAdminRole, effectiveRole, isSuperAdminActor, publicRoleFields };
