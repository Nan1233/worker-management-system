import { Component, type ErrorInfo, type ReactNode } from "react";
interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    message: string;
}

function isStaleSessionCancellation(error: Error | null | undefined): boolean {
    const message = String(error?.message || "").trim();
    return (
        error?.name === "CanceledError" ||
        message === "Phản hồi thuộc phiên đăng nhập cũ đã bị hủy." ||
        message === "Kết quả refresh thuộc phiên cũ đã bị bỏ qua."
    );
}

export default class AppErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, message: "" };

    static getDerivedStateFromError(error: Error): State {
        // A request cancelled because another tab/session became authoritative
        // is a normal auth lifecycle event, not a broken application screen.
        if (isStaleSessionCancellation(error)) {
            return { hasError: false, message: "" };
        }

        return {
            hasError: true,
            message: error?.message || "Đã xảy ra lỗi không mong muốn.",
        };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        if (isStaleSessionCancellation(error)) return;
        console.error("KTC_FRONTEND_UNHANDLED_ERROR", {
            message: error.message,
            stack: error.stack,
            componentStack: info.componentStack,
        });
    }

    private reload = () => {
        window.location.reload();
    };

    private goToLogin = () => {
        window.location.hash = "#/login";
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <main className="app-error-boundary" role="alert">
                <section className="app-error-card">
                    <div className="app-error-icon" aria-hidden="true">!</div>
                    <p className="app-error-eyebrow">KTC Production Control</p>
                    <h1>Không thể hiển thị màn hình này</h1>
                    <p>
                        Ứng dụng gặp lỗi giao diện cục bộ. Dữ liệu đã lưu trên máy chủ không bị xóa.
                        Bạn có thể tải lại ứng dụng hoặc quay về màn hình đăng nhập.
                    </p>
                    {import.meta.env.DEV && this.state.message ? (
                        <pre className="app-error-detail">{this.state.message}</pre>
                    ) : null}
                    <div className="app-error-actions">
                        <button type="button" className="ktc-btn ktc-btn-primary" onClick={this.reload}>Tải lại</button>
                        <button type="button" className="ktc-btn ktc-btn-secondary" onClick={this.goToLogin}>Về đăng nhập</button>
                    </div>
                </section>
            </main>
        );
    }
}