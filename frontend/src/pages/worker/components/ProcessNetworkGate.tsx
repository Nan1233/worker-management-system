interface Props {
    checking: boolean;
    allowed: boolean;
    message: string;
    clientIp?: string;
    onRetry: () => void;
    onBack: () => void;
}

export default function ProcessNetworkGate({ checking, allowed, message, clientIp, onRetry, onBack }: Props) {
    if (checking) {
        return (
            <main className="worker-form-page worker-network-page">
                <section className="worker-network-card" aria-live="polite">
                    <div className="worker-network-symbol" aria-hidden="true">↻</div>
                    <h1>Đang kiểm tra mạng công ty</h1>
                    <p>Vui lòng chờ trong giây lát.</p>
                </section>
            </main>
        );
    }

    if (allowed) return null;

    return (
        <main className="worker-form-page worker-network-page">
            <section className="worker-network-card worker-network-denied" role="alert">
                <div className="worker-network-symbol" aria-hidden="true">!</div>
                <h1>Không thể nhập báo cáo</h1>
                <p>{message}</p>
                {clientIp ? <small>IP hiện tại: {clientIp}</small> : null}
                <div className="worker-network-actions">
                    <button type="button" onClick={onRetry} aria-label="Kiểm tra lại kết nối mạng KTC">Kiểm tra lại</button>
                    <button type="button" className="secondary" onClick={onBack}>Quay lại</button>
                </div>
            </section>
        </main>
    );
}
