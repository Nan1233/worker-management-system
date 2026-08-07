import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    message: string;
}

export default class AppErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, message: "" };

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            message: error?.message || "Đã xảy ra lỗi không mong muốn.",
        };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
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
