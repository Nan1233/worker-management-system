import AdminPermissions from "../admin/Permissions";
import { PageHeader } from "./ControlStates";

// Reuses the existing permission matrix screen (same API, same backend permission service);
// no second permission system is created.
export default function MasterControlPermissions() {
    return <div>
        <PageHeader title="Roles & Permissions" description="Mặc định theo vai trò, override theo vai trò và theo tài khoản. Backend chặn cấp vượt trần vai trò, không cho tắt quyền bắt buộc và ghi audit mọi thay đổi." />
        <AdminPermissions />
    </div>;
}
