import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getMyTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import "./ProductionHistoryCompact.css";

const PAGE_SIZE = 10;
const fmtDate = (v?: string) => {
  if (!v) return "—";
  const [y, m, d] = v.split("T")[0].split("-");
  return y && m && d ? `${d}/${m}/${y}` : v;
};
const fmt = (v?: number | null) => new Intl.NumberFormat("vi-VN").format(Number(v ?? 0));
const norm = (v?: string) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const status = (v?: string) => v === "approved" ? ["Đã duyệt", "approved"] : v === "need_fix" ? ["Cần sửa", "need-fix"] : v === "rejected" ? ["Từ chối", "rejected"] : ["Chờ duyệt", "pending"];

export default function ProductionHistoryCompact() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [shift, setShift] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setError("");
        const data = await getMyTempReports();
        setReports(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải lịch sử báo cáo" : "Không thể tải lịch sử báo cáo");
      } finally { setLoading(false); }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = norm(q);
    return reports.filter(r => {
      const workDate = r.work_date?.split("T")[0] || "";
      const text = norm([r.machine_no, r.product_name, r.process_name, r.shift].join(" "));
      return (!keyword || text.includes(keyword)) && (!date || workDate === date) && (!shift || r.shift === shift) && (!state || r.status === state);
    });
  }, [reports, q, date, shift, state]);
  useEffect(() => setPage(1), [q, date, shift, state]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const clear = () => { setQ(""); setDate(""); setShift(""); setState(""); };
  const open = (r: ProductionReport) => {
    if (!r.id) return;
    const source = r.source || (r.status === "approved" ? "approved" : "pending");
    navigate(`/worker/history/${r.id}?source=${source}`);
  };

  if (loading) return <main className="worker-history-compact"><div className="whc-state">Đang tải lịch sử...</div></main>;
  if (error) return <main className="worker-history-compact"><div className="whc-state whc-error">{error}</div></main>;

  return <main className="worker-history-compact">
    <header className="whc-header">
      <div><button type="button" className="whc-back" onClick={() => navigate("/worker")}>←</button><div><h1>Báo cáo của tôi</h1><p>Lịch sử báo cáo sản xuất</p></div></div>
      <span className="whc-count">{filtered.length} báo cáo</span>
    </header>

    <section className="whc-toolbar">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm máy, sản phẩm, công đoạn..." />
      <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Ngày" />
      <select value={shift} onChange={e => setShift(e.target.value)} aria-label="Ca"><option value="">Tất cả ca</option><option value="A">Ca A</option><option value="B">Ca B</option><option value="C">Ca C</option><option value="D">Ca D</option></select>
      <select value={state} onChange={e => setState(e.target.value)} aria-label="Trạng thái"><option value="">Tất cả trạng thái</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="need_fix">Cần sửa</option><option value="rejected">Từ chối</option></select>
      {(q || date || shift || state) && <button type="button" className="whc-clear" onClick={clear}>Xóa lọc</button>}
    </section>

    <section className="whc-table-wrap">
      <table><thead><tr><th>Ngày</th><th>Ca</th><th>Máy</th><th>Sản phẩm</th><th className="num ok">OK</th><th className="num ng">NG</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map((r, i) => { const [label, cls] = status(r.status); return <tr key={r.id ?? `${r.work_date}-${i}`}>
          <td>{fmtDate(r.work_date)}</td><td>{r.shift || "—"}</td><td title={r.machine_no}>{r.machine_no || "—"}</td><td title={r.product_name}>{r.product_name || "—"}</td>
          <td className="num ok">{fmt(r.tt_ok)}</td><td className="num ng">{fmt(r.tt_ng)}</td><td><span className={`whc-status ${cls}`}>{label}</span></td><td><button type="button" className="whc-detail" onClick={() => open(r)}>Chi tiết</button></td>
        </tr>; }) : <tr><td colSpan={8} className="whc-empty">Không có báo cáo phù hợp.</td></tr>}</tbody>
      </table>
      <footer className="whc-footer"><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} / ${filtered.length}` : "0 báo cáo"}</span>{pages > 1 && <div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button><span>{page}/{pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>›</button></div>}</footer>
    </section>
  </main>;
}
