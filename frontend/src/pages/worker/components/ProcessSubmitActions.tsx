interface DuplicatePrompt {
    reportId: number;
}

interface Props {
    duplicatePrompt: DuplicatePrompt | null;
    submitting: boolean;
    loadingWorker: boolean;
    onCancelDuplicate: () => void;
    onUpdateExisting: () => void;
    onCreateDuplicate: () => void;
    onReset: () => void;
    onSubmit: () => void;
}

export default function ProcessSubmitActions({
    duplicatePrompt,
    submitting,
    loadingWorker,
    onCancelDuplicate,
    onUpdateExisting,
    onCreateDuplicate,
    onReset,
    onSubmit,
}: Props) {
    return (
        <>
            {duplicatePrompt && (
                <div className="duplicate-dialog-backdrop" role="presentation">
                    <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title">
                        <h2 id="duplicate-dialog-title">Phát hiện báo cáo tương tự</h2>
                        <p>
                            Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm.
                            Bạn muốn chỉnh sửa báo cáo cũ hay vẫn tạo báo cáo mới?
                        </p>
                        <div className="duplicate-dialog-actions">
                            <button type="button" className="duplicate-dialog-cancel" onClick={onCancelDuplicate}>Hủy</button>
                            <button type="button" className="duplicate-dialog-edit" onClick={onUpdateExisting} disabled={submitting}>Chỉnh sửa báo cáo cũ</button>
                            <button type="button" className="duplicate-dialog-create" onClick={onCreateDuplicate} disabled={submitting}>Vẫn tạo báo cáo mới</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="worker-action-group" aria-busy={submitting}>
                <div className="worker-action-copy">
                    <strong>{submitting ? "Đang kiểm tra và lưu báo cáo" : "Sẵn sàng gửi báo cáo"}</strong>
                    <span>{submitting ? "Vui lòng giữ màn hình này cho tới khi hoàn tất." : "Hệ thống sẽ kiểm tra dữ liệu trước khi gửi."}</span>
                </div>
                <div className="worker-action-buttons">
                    <button type="button" className="worker-reset-button" onClick={onReset} disabled={submitting}>Làm mới</button>
                    <button type="button" className="worker-floating-save" onClick={onSubmit} disabled={loadingWorker || submitting}>
                        {submitting ? "Đang lưu..." : "Lưu báo cáo"}
                    </button>
                </div>
            </div>
        </>
    );
}
