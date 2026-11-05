import { HardDriveDownload } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { Badge, ControlDenied, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { useControlQuery } from "./useControlQuery";

export default function MasterControlBackup() {
    const { data, loading, error, forbidden, reload } = useControlQuery(() => masterControlApi.backup(), "backup");
    return <div>
        <PageHeader title="Backup & Recovery" description="Chỉ hiển thị dữ liệu backup khi có nguồn thật. Khôi phục production không thực hiện từ giao diện web." />
        {loading && !data ? <ControlLoading /> : null}
        {forbidden ? <ControlDenied /> : error ? <ControlError message={error} onRetry={reload} /> : null}
        {data ? <div className="mcc-grid">
            <div className="mcc-notice mcc-notice-warning" role="status"><HardDriveDownload size={16} aria-hidden="true" /><span><strong>Lịch sử backup: Not available.</strong> {data.message}</span></div>
            <div className="mcc-card"><div className="mcc-card-head"><h2>Kiểm tra cấu hình</h2></div><ul className="mcc-list">
                <li><span>Khóa mã hóa backup (KTC_BACKUP_ENCRYPTION_KEY) trên runtime này</span>{data.encryptionKeyConfigured ? <Badge tone="success">Đã cấu hình</Badge> : <Badge tone="danger">Chưa cấu hình — backup sẽ không được mã hóa</Badge>}</li>
                <li><span>Khôi phục từ web</span><Badge tone="neutral">{data.restoreFromWeb ? "Bật" : "Tắt (có chủ đích)"}</Badge></li>
                <li><span>Mã trạng thái</span><span className="mcc-mono">{data.reason}</span></li>
            </ul></div>
            <div className="mcc-card"><div className="mcc-card-head"><div><h2>Quy trình hiện có (CLI, chạy bởi người vận hành)</h2><p>Theo BACKUP_AND_RECOVERY_PLAN.md</p></div></div><ul className="mcc-list">
                <li><span>Tạo backup</span><span className="mcc-mono">npm run backup:db</span></li>
                <li><span>Kiểm tra checksum / manifest</span><span className="mcc-mono">npm run backup:verify</span></li>
                <li><span>Diễn tập khôi phục</span><span className="mcc-mono">npm run restore:rehearsal</span></li>
                <li><span>Khôi phục (bắt buộc maintenance RESTORE, nhiều bước xác nhận)</span><span className="mcc-mono">npm run restore:db</span></li>
            </ul></div>
        </div> : null}
    </div>;
}
