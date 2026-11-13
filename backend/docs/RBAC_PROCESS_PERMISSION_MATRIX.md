# KTC Backend RBAC / process-scope audit (test branch)

This is a **code-level permission matrix**, not a certification of all endpoints. Effective authorization requires **all** of: valid active authenticated DB identity, route role gate, the relevant permission code, and resource-specific process/worker scope. A permission code alone never authorizes another process or worker's record.

| Operation | Admin | Manager | Lead | Worker |
| --- | --- | --- | --- | --- |
| Read approved reports | All | Assigned processes + REPORT_APPROVED_VIEW | Assigned processes + REPORT_APPROVED_VIEW | Own report only, via ID ownership check |
| Read pending reports | All | Assigned processes + REPORT_PENDING_VIEW | Assigned processes + REPORT_PENDING_VIEW | Own report/history only |
| Approve/reject pending | Allowed | Assigned processes + REPORT_APPROVE | Assigned processes + REPORT_APPROVE | Denied |
| Edit pending | Permission-gated | Assigned processes + REPORT_PENDING_EDIT | Assigned processes + REPORT_PENDING_EDIT | Own eligible report only |
| Edit approved | Permission-gated | Assigned processes + REPORT_APPROVED_EDIT | Assigned processes + REPORT_APPROVED_EDIT | Denied |
| Delete approved | Permission-gated | Assigned processes + REPORT_DELETE | Denied by default permission matrix | Denied |
| Excel DB sync | Permission-gated | Assigned processes + EXCEL_DB_SYNC | Denied | Denied |
| Manage permissions | Allowed | Denied | Denied | Denied |

**Important:** This table documents default policy and expected scope, not a new permission grant. Existing per-user overrides, edit locks, workflow states, concurrency checks and narrower route restrictions still apply. `admin_ops` is a separate existing role; it must not inherit unrestricted admin access.

## Audit findings / status

- **Fixed:** `middleware/authMiddleware.js` previously looked up a token's numeric `id` and, if missing, retried by username or worker ID. A deleted/reassigned identity could be rebound to a different DB account. Numeric-ID tokens now fail closed; regression tests cover deleted ID and renamed user.
- **Reviewed:** `services/processAuthorizationService.js` enforces admin ALL vs manager/lead assigned `manager_processes`, and worker ownership / `worker_processes`. Controllers must invoke it for every object ID, not only list filters.
- **Needs further verification:** all controllers and bulk mutation paths, Excel synchronization, master data, export, audit logs, proposals, and permission overrides need route-by-route negative HTTP tests. Existing source-level tests do not prove every endpoint is secure.
- **HTTP contract:** unauthenticated/invalid token = 401; authenticated without role/permission/scope/ownership = 403; invalid IDs = 400; missing resources = 404. Avoid returning raw DB errors or sensitive objects in authorization failures.
- **Safety:** no production database, `main` branch, or deployed Cloudflare services were modified.

## Regression commands

```sh
cd backend
node --test tests/auth-token-identity-binding.test.cjs tests/permission-matrix.test.cjs tests/authorization-process-scope.test.js tests/authorization-f09-scope.test.js
```
