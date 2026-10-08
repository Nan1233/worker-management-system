import { DESKTOP_DOWNLOAD_URL } from "../../config/env";

/**
 * Excel workbooks are built by the KTC Desktop app (the server never builds
 * monthly workbooks). In a browser this explains that, instead of leaving users
 * to hunt for a missing button. Inside the Desktop app it renders nothing.
 */
export function isDesktopApp(): boolean {
    return typeof window !== "undefined" && Boolean(window.ktcDesktop?.isDesktop);
}

export default function DesktopExcelNotice({ compact = false }: { compact?: boolean }) {
    if (isDesktopApp()) return null;
    return (
        <section
            role="note"
            data-testid="desktop-excel-notice"
            style={{
                display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between",
                margin: compact ? "0 0 12px" : "12px 0", padding: "12px 16px", borderRadius: 10,
                border: "1px solid #b9d2f5", background: "#f5f9ff", color: "#174ea6"
            }}
        >
            <div style={{ minWidth: 0 }}>
                <strong>Xuất / cập nhật Excel cần dùng ứng dụng KTC Desktop</strong>
                {!compact && <div>Trình duyệt web không tạo file Excel. Hãy cài KTC Desktop, đăng nhập rồi bấm “Cập nhật Excel” ở trang Báo cáo đã duyệt.</div>}
            </div>
            <a
                href={DESKTOP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 18px", borderRadius: 8, background: "#174ea6", color: "#fff", fontWeight: 700, textDecoration: "none" }}
            >
                Tải KTC Desktop
            </a>
        </section>
    );
}
