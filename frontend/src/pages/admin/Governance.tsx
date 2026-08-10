import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import "./Governance.css";
import { usePermissions } from "../../hooks/usePermissions";

type Summary = {
  locked_periods: number;
  monthly_plans: number;
  open_validation_issues: number;
  active_standard_versions: number;
  approved_snapshots: number;
};

type PeriodLock = {
  id: number;
  report_year: number;
  report_month: number;
  process_name?: string | null;
  reason?: string | null;
  status: string;
  locked_by_name?: string | null;
};

type Plan = {
  id: number;
  plan_date: string;
  shift?: string | null;
  process_name: string;
  machine_code?: string | null;
  product_code: string;
  planned_quantity: number;
  status: string;
};

const initialSummary: Summary = {
  locked_periods: 0,
  monthly_plans: 0,
  open_validation_issues: 0,
  active_standard_versions: 0,
  approved_snapshots: 0,
};

export default function Governance() {
  const { can } = usePermissions();
  const canLock = can("PERIOD_LOCK");
  const canUnlock = can("PERIOD_UNLOCK");
  const now = new Date();
  const [summary, setSummary] = useState(initialSummary);
  const [locks, setLocks] = useState<PeriodLock[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lockForm, setLockForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    reason: "Chốt số liệu tháng",
  });
  const [planForm, setPlanForm] = useState({
    plan_date: now.toISOString().slice(0, 10),
    process_id: "",
    product_code: "",
    planned_quantity: "",
    shift: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, locksRes, plansRes] = await Promise.all([
        api.get("/governance/summary"),
        api.get("/governance/period-locks"),
        api.get("/governance/plans"),
      ]);
      setSummary(summaryRes.data.data ?? initialSummary);
      setLocks(locksRes.data.data ?? []);
      setPlans(plansRes.data.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được dữ liệu quản trị");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function lockPeriod(event: React.FormEvent) {
    event.preventDefault();
    await api.post("/governance/period-locks", lockForm);
    setMessage("Đã khóa kỳ báo cáo.");
    await load();
  }

  async function unlockPeriod(id: number) {
    await api.patch(`/governance/period-locks/${id}/unlock`);
    setMessage("Đã mở khóa kỳ báo cáo.");
    await load();
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    await api.post("/governance/plans", {
      ...planForm,
      process_id: Number(planForm.process_id),
      planned_quantity: Number(planForm.planned_quantity || 0),
    });
    setMessage("Đã tạo kế hoạch sản xuất.");
    setPlanForm((current) => ({ ...current, product_code: "", planned_quantity: "" }));
    await load();
  }

  return (
    <main className="governance-page">
      <header className="governance-header">
        <div>
          <p className="governance-kicker">Quản trị dữ liệu</p>
          <h1>Nền tảng hệ thống hoàn chỉnh</h1>
          <p>Quản lý phiên bản định mức, snapshot báo cáo, kế hoạch và khóa số liệu tháng.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>Tải lại</button>
      </header>

      {message && <div className="governance-message">{message}</div>}

      <section className="governance-cards">
        <article><strong>{summary.active_standard_versions}</strong><span>Phiên bản định mức</span></article>
        <article><strong>{summary.approved_snapshots}</strong><span>Snapshot đã duyệt</span></article>
        <article><strong>{summary.monthly_plans}</strong><span>Kế hoạch trong tháng</span></article>
        <article><strong>{summary.locked_periods}</strong><span>Kỳ đang khóa</span></article>
        <article><strong>{summary.open_validation_issues}</strong><span>Lỗi cần xử lý</span></article>
      </section>

      <section className="governance-grid">
        <article className="governance-panel">
          <h2>Khóa kỳ báo cáo</h2>
          {canLock && <form onSubmit={lockPeriod} className="governance-form">
            <label>Năm<input type="number" value={lockForm.year} onChange={(e) => setLockForm({ ...lockForm, year: Number(e.target.value) })} /></label>
            <label>Tháng<input type="number" min="1" max="12" value={lockForm.month} onChange={(e) => setLockForm({ ...lockForm, month: Number(e.target.value) })} /></label>
            <label className="wide">Lý do<input value={lockForm.reason} onChange={(e) => setLockForm({ ...lockForm, reason: e.target.value })} /></label>
            <button type="submit">Khóa kỳ</button>
          </form>}
          <div className="governance-list">
            {locks.map((item) => (
              <div key={item.id} className="governance-row">
                <div><strong>{String(item.report_month).padStart(2, "0")}/{item.report_year}</strong><small>{item.process_name || "Toàn bộ công đoạn"} · {item.reason || "Không có lý do"}</small></div>
                {item.status === "locked" && canUnlock && <button type="button" onClick={() => void unlockPeriod(item.id)}>Mở khóa</button>}
              </div>
            ))}
          </div>
        </article>

        <article className="governance-panel">
          <h2>Kế hoạch sản xuất cơ bản</h2>
          <form onSubmit={createPlan} className="governance-form">
            <label>Ngày<input type="date" value={planForm.plan_date} onChange={(e) => setPlanForm({ ...planForm, plan_date: e.target.value })} /></label>
            <label>ID công đoạn<input required inputMode="numeric" value={planForm.process_id} onChange={(e) => setPlanForm({ ...planForm, process_id: e.target.value })} /></label>
            <label>Mã sản phẩm<input required value={planForm.product_code} onChange={(e) => setPlanForm({ ...planForm, product_code: e.target.value })} /></label>
            <label>Số lượng KH<input type="number" min="0" value={planForm.planned_quantity} onChange={(e) => setPlanForm({ ...planForm, planned_quantity: e.target.value })} /></label>
            <label>Ca<input placeholder="Ca 1" value={planForm.shift} onChange={(e) => setPlanForm({ ...planForm, shift: e.target.value })} /></label>
            <button type="submit">Tạo kế hoạch</button>
          </form>
          <div className="governance-list">
            {plans.slice(0, 20).map((item) => (
              <div key={item.id} className="governance-row">
                <div><strong>{item.plan_date.slice(0, 10)} · {item.product_code}</strong><small>{item.process_name}{item.machine_code ? ` · ${item.machine_code}` : ""} · KH {Number(item.planned_quantity).toLocaleString("vi-VN")}</small></div>
                <span className="governance-status">{item.status}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
