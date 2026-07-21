import React from "react";

type State = { hasError: boolean; message: string };

export default class DesktopErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Lỗi giao diện không xác định.",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("DESKTOP_RENDER_ERROR", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f6fb", padding: 24 }}>
        <section style={{ maxWidth: 620, background: "white", padding: 32, borderRadius: 20, boxShadow: "0 18px 50px rgba(15,23,42,.12)" }}>
          <h1 style={{ marginTop: 0, color: "#173b6c" }}>Không thể hiển thị giao diện</h1>
          <p>Ứng dụng đã ghi lỗi vào log. Hãy đóng và mở lại ứng dụng.</p>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f8fafc", padding: 14, borderRadius: 12 }}>
            {this.state.message}
          </pre>
          <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 42, padding: "0 18px", border: 0, borderRadius: 10, background: "#2563eb", color: "white", fontWeight: 700 }}>
            Tải lại giao diện
          </button>
        </section>
      </main>
    );
  }
}
