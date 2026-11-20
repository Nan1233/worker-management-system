/** Reject dialog view; confirmations and API writes remain in Reports. */
type PendingRejectDialogProps = {
    rejectDialogOpen: boolean;
    rejectTargetIds: number[];
    rejectReason: string;
    rejectNote: string;
    rejecting: boolean;
    loading: boolean;
    error: string;
    closeRejectDialog: () => void;
    setRejectReason: (reason: string) => void;
    setRejectNote: (note: string) => void;
    rejectTargets: () => void;
};

export default function PendingRejectDialog(props: PendingRejectDialogProps) {
    const {
        rejectDialogOpen, rejectTargetIds, rejectReason, rejectNote, rejecting,
        loading, error, closeRejectDialog, setRejectReason, setRejectNote, rejectTargets
    } = props;
    if (!rejectDialogOpen) return null;
    return (
<div role="presentation" onClick={e => { if (e.target === e.currentTarget) closeRejectDialog(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,35,60,.42)", display: "grid", placeItems: "center", padding: 16 }}>
            <section className="pending-reject-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title" aria-describedby="reject-dialog-description" style={{ width: "min(100%, 480px)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,35,60,.25)", padding: 22 }}>
                <h2 id="reject-dialog-title" style={{ margin: "0 0 6px", color: "#12385f", fontSize: 20 }}>Từ chối báo cáo</h2>
                <p id="reject-dialog-description" style={{ margin: "0 0 16px", color: "#526b88", fontSize: 13 }}>Đang chọn <strong>{rejectTargetIds.length}</strong> báo cáo. Chọn lý do trước khi xác nhận.</p>
                <label htmlFor="pending-reject-reason" style={{ display: "block", fontSize: 13, color: "#244564", marginBottom: 6, fontWeight: 700 }}>Lý do từ chối <span style={{ color: "#b42323" }}>*</span></label>
                <select id="pending-reject-reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} disabled={rejecting} style={{ width: "100%", minHeight: 40, border: "1px solid #cbd9e8", borderRadius: 8, padding: "8px 10px", background: "#fff", color: "#244564" }}>
                    <option value="">-- Chọn lý do --</option>
                    <option value="Thiếu công đoạn hoặc sản phẩm để tra định mức">Thiếu công đoạn hoặc sản phẩm để tra định mức</option>
                    <option value="Sai công đoạn hoặc sản phẩm">Sai công đoạn hoặc sản phẩm</option>
                    <option value="Sai số lượng OK/NG">Sai số lượng OK/NG</option>
                    <option value="Thiếu thông tin báo cáo">Thiếu thông tin báo cáo</option>
                    <option value="Sai ngày báo cáo hoặc ca làm việc">Sai ngày báo cáo hoặc ca làm việc</option>
                    <option value="Báo cáo bị trùng">Báo cáo bị trùng</option>
                    <option value="Khác">Khác</option>
                </select>
                {rejectReason === "Khác" && <textarea aria-label="Lý do từ chối cụ thể" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Nhập lý do từ chối cụ thể..." rows={3} disabled={rejecting} style={{ width: "100%", boxSizing: "border-box", marginTop: 10, border: "1px solid #cbd9e8", borderRadius: 8, padding: 10, resize: "vertical" }} />}
                <div className="pending-reject-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" onClick={closeRejectDialog} disabled={rejecting} style={{ border: "1px solid #cbd9e8", borderRadius: 8, padding: "9px 14px", background: "#fff", color: "#526b88" }}>Hủy</button>
                    <button type="button" onClick={() => void rejectTargets()} disabled={rejecting || loading || Boolean(error) || !rejectReason || (rejectReason === "Khác" && !rejectNote.trim())} style={{ border: 0, borderRadius: 8, padding: "9px 14px", background: rejecting || !rejectReason || (rejectReason === "Khác" && !rejectNote.trim()) ? "#cbd5e1" : "#b42323", color: "#fff", fontWeight: 700 }}>{rejecting ? "Đang từ chối..." : `Xác nhận từ chối ${rejectTargetIds.length} báo cáo`}</button>
                </div>
            </section>
        </div>
    );
}
