import { useState } from "react";

function display(value: unknown): string {
    if (value == null || value === "") return "—";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function ApprovedExcelImportPreview({ preview, busy, onCancel, onConfirm }: {
    preview: DesktopReportImportPreview; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
    const [page, setPage] = useState(1);
    const size = 20;
    const pages = Math.max(1, Math.ceil(preview.changes.length / size));
    const current = Math.min(page, pages);
    const invalid = preview.changes.filter(change => change.invalid).length;
    return <div className="approved-excel-preview">
        <h3>Xem trước thay đổi từ Excel</h3>
        <p>{preview.fileName || "File Excel"} · {preview.yearMonth || "Chưa rõ kỳ"} · {preview.detected} thay đổi ({preview.creates || 0} thêm, {preview.updates || 0} cập nhật)</p>
        {invalid > 0 && <p role="alert" className="approved-excel-preview-error">Có {invalid} dòng không hợp lệ. Sửa file và xem trước lại trước khi import.</p>}
        <div className="approved-excel-preview-scroll" role="region" tabIndex={0} aria-label="Chi tiết thay đổi Excel trước và sau">
            <table><caption>Thay đổi sẽ được gửi vào DB</caption><thead><tr><th scope="col">Báo cáo / dòng</th><th scope="col">Trường</th><th scope="col">Trước</th><th scope="col">Sau</th></tr></thead>
            <tbody>{preview.changes.slice((current - 1) * size, current * size).map((change, index) => {
                const label = change.create ? `Thêm dòng ${change.row ?? change.source?.row ?? "—"}` : `#${change.id}`;
                const fields = change.preview || [];
                const key = `${current}-${index}`;
                if (change.invalid || !fields.length) return <tr key={key}><th scope="row">{label}</th><td colSpan={3}>{change.error || "Không có chi tiết trường"}</td></tr>;
                return fields.map((field, fieldIndex) => <tr key={key + "-" + fieldIndex}><th scope="row">{label}</th><td>{field.label}</td><td>{display(field.before)}</td><td>{display(field.after)}</td></tr>);
            })}</tbody></table>
        </div>
        <div className="approved-excel-preview-actions"><button type="button" disabled={busy || current <= 1} onClick={() => setPage(current - 1)}>Trước</button><span role="status">Trang {current}/{pages}</span><button type="button" disabled={busy || current >= pages} onClick={() => setPage(current + 1)}>Sau</button><button type="button" disabled={busy} onClick={onCancel}>Hủy import</button><button type="button" disabled={busy || invalid > 0} onClick={onConfirm}>{busy ? "Đang import…" : "Xác nhận import"}</button></div>
    </div>;
}
