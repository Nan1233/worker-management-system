import { RefreshCw } from "lucide-react";
import { masterControlApi } from "../../services/masterControlService";
import { ControlDenied, ControlError, ControlLoading, PageHeader } from "./ControlStates";
import { useControlQuery } from "./useControlQuery";
import { OVERVIEW_LAYOUT, WIDGETS_BY_ID } from "./widgetRegistry";

export default function MasterControlOverview() {
    const { data, loading, error, forbidden, reload } = useControlQuery(() => masterControlApi.overview(), "overview");
    const render = (id: string) => {
        const widget = WIDGETS_BY_ID.get(id);
        return widget && data ? <div key={id}>{widget.render(data)}</div> : null;
    };
    return <div>
        <PageHeader title="Overview Dashboard" description="Dữ liệu thật từ cơ sở dữ liệu và runtime. Mục không có nguồn được ghi rõ Not available." actions={<button type="button" className="mcc-btn" onClick={reload} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Làm mới</button>} />
        {loading && !data ? <ControlLoading /> : null}
        {forbidden ? <ControlDenied /> : error ? <ControlError message={error} onRetry={reload} /> : null}
        {data ? <>
            {!data.counts ? <div className="mcc-notice mcc-notice-danger" role="alert">Không truy vấn được số liệu ({data.database.errorCode}). Các ô số hiển thị "—".</div> : null}
            <section className="mcc-grid mcc-grid-kpi mcc-section" aria-label="Chỉ số chính">{OVERVIEW_LAYOUT.kpis.map(render)}</section>
            <section className="mcc-grid mcc-grid-2 mcc-section">{OVERVIEW_LAYOUT.columns.map((column, index) => <div key={index} className="mcc-grid">{column.map(render)}</div>)}</section>
        </> : null}
    </div>;
}
