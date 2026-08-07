export default function RouteLoading() {
    return (
        <main className="route-loading" aria-live="polite" aria-busy="true">
            <section className="route-loading-shell">
                <div className="route-loading-line route-loading-line-title" />
                <div className="route-loading-line route-loading-line-subtitle" />
                <div className="route-loading-card">
                    <div className="route-loading-line" />
                    <div className="route-loading-line" />
                    <div className="route-loading-line route-loading-line-short" />
                </div>
                <span className="sr-only">Đang tải nội dung</span>
            </section>
        </main>
    );
}
