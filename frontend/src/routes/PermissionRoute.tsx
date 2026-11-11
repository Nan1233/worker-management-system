import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import RouteLoading from '../components/system/RouteLoading';
import { loadMyPermissions, type PermissionCode } from '../security/permissions';
import { getStoredUser } from '../utils/authStorage';

const fallbackOrder: Array<[PermissionCode, string]> = [
  ['DASHBOARD_VIEW', ''],
  ['REPORT_PENDING_VIEW', 'reports'],
  ['REPORT_APPROVED_VIEW', 'approved'],
  ['REPORT_EXPORT', 'export'],
  ['STATISTICS_VIEW', 'statistics'],
  ['USER_VIEW', 'workers'],
  ['MASTER_VIEW', 'master/machines'],
  ['NOTIFICATION_VIEW', 'notifications'],
  ['PROFILE_VIEW', 'profile']
];

type PermissionState = {
  allowed: boolean | null;
  fallback: string;
  verified: boolean;
};

export default function PermissionRoute({
  permission,
  children
}: {
  permission: PermissionCode;
  children: ReactNode;
}) {
  const user = getStoredUser();
  const base = useMemo(() => (
    user?.role === 'admin' ? '/admin'
      : user?.role === 'admin_ops' ? '/admin-ops'
        : user?.role === 'manager' ? '/manager'
          : user?.role === 'lead' ? '/lead' : '/worker'
  ), [user?.role]);
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<PermissionState>({
    allowed: null,
    fallback: base,
    verified: false
  });

  useEffect(() => {
    let active = true;
    setState({ allowed: null, fallback: base, verified: false });
    loadMyPermissions(retryCount > 0).then((permissions) => {
      if (!active) return;
      if (permissions.size === 0) {
        // Do not grant role defaults or redirect in a loop when the permission
        // endpoint is unavailable or no capabilities have been assigned.
        setState({ allowed: false, fallback: base, verified: false });
        return;
      }
      const next = fallbackOrder.find(([code]) => permissions.has(code));
      setState({
        allowed: permissions.has(permission),
        fallback: next ? `${base}${next[1] ? '/' + next[1] : ''}` : base,
        verified: true
      });
    }).catch(() => {
      if (active) setState({ allowed: false, fallback: base, verified: false });
    });
    return () => { active = false; };
  }, [permission, base, user?.id, retryCount]);

  if (state.allowed === null) return <RouteLoading />;
  if (!state.verified) {
    return (
      <section role="alert" aria-live="polite">
        <p>Không thể xác minh quyền truy cập. Vui lòng kiểm tra kết nối và thử lại.</p>
        <button type="button" onClick={() => setRetryCount((current) => current + 1)}>
          Thử lại
        </button>
      </section>
    );
  }
  return state.allowed ? <>{children}</> : <Navigate to={state.fallback} replace />;
}
