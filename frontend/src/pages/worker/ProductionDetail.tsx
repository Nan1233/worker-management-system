import WorkerReportEditV2 from "./WorkerReportEditV2";

/**
 * Detail view intentionally reuses the exact same worker report form as the
 * edit screen. This prevents the detail/edit/input screens from drifting in
 * fields, machine/product layout, NG/deduction sections or styling.
 *
 * The form itself is made read-only here; the dedicated /edit route remains
 * the only place where the worker can modify and save the report.
 */
export default function ProductionDetail() {
  return (
    <div className="worker-report-detail-readonly">
      <style>{`
        .worker-report-detail-readonly .worker-form-container {
          pointer-events: none;
        }
        .worker-report-detail-readonly .worker-form-container > .worker-form-card:first-child {
          display: none;
        }
        .worker-report-detail-readonly .worker-action-group {
          display: none !important;
        }
        .worker-report-detail-readonly .worker-sticky-date {
          pointer-events: none;
        }
        .worker-report-detail-readonly .worker-form-title-row h1 {
          font-size: 0 !important;
        }
        .worker-report-detail-readonly .worker-form-title-row h1::after {
          content: "Chi tiết báo cáo sản xuất";
          font-size: 18px;
        }
        @media (max-width: 680px) {
          .worker-report-detail-readonly .worker-form-title-row h1::after {
            font-size: 16px;
          }
        }
      `}</style>
      <WorkerReportEditV2 />
    </div>
  );
}
