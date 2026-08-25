import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/feedback/toastContext";
import { getTempReportDetail } from "../../services/productionService";
import { getReportEditProposals, reviewReportEditProposal, type ReportEditProposal } from "../../services/reportEditProposalService";
import "./ReportEditProposals.css";

const num = (v: any) => Number(v || 0);
const mins = (v: any) => Math.round(num(v) * 60);
const normalize = (r: any) => ({
  work_date: String(r?.work_date || "").slice(0, 10),
  shift: r?.shift || "",
  machine_no: r?.machine_no || "",
  product_name: r?.product_name || "",
  actual_time: num(r?.actual_time),
  tt_ok: num(r?.tt_ok),
  note: r?.note || "",
  deductions: (r?.deductions || []).map((x: any) => ({ ...x, hours: num(x.hours) })),
  defects: (r?.defects || []).map((x: any) => ({ ...x, quantity: num(x.quantity) })),
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const key = (x: any, type: string) => String(x?.[`${type}_type_id`] || x?.id || x?.[`${type}_name`] || x?.[`${type}_code`]);

function compareRows(original: any, draft: any) {
  const rows: Array<{ group: string; label: string; before: string; after: string; changed: boolean }> = [];
  const add = (group: string, label: string, before: any, after: any) => {
    const b = String(before ?? "").trim() || "---";
    const a = String(after ?? "").trim() || "---";
    rows.push({ group, label, before: b, after: a, changed: b !== a });
  };
  add("Thông tin chung", "Ngày báo cáo", original?.work_date, draft?.work_date);
  add("Thông tin chung", "Ca", original?.shift, draft?.shift);
  add("Thông tin chung", "Máy", original?.machine_no, draft?.machine_no);
  add("Thông tin chung", "Sản phẩm", original?.product_name, draft?.product_name);
  add("Sản xuất", "Giờ làm thực tế", `${num(original?.actual_time)} giờ`, `${num(draft?.actual_time)} giờ`);
  add("Sản xuất", "Sản lượng OK", num(original?.tt_ok), num(draft?.tt_ok));
  add("Sản xuất", "Ghi chú", original?.note || "---", draft?.note || "---");

  const beforeDed = new Map((original?.deductions || []).map((x: any) => [key(x, "deduction"), x]));
  const afterDed = new Map((draft?.deductions || []).map((x: any) => [key(x, "deduction"), x]));
  new Set([...beforeDed.keys(), ...afterDed.keys()]).forEach(k => {
    const b: any = beforeDed.get(k); const a: any = afterDed.get(k);
    const name = a?.deduction_name || a?.deduction_code || b?.deduction_name || b?.deduction_code || "Thời gian trừ";
    add("Thời gian trừ", name, `${mins(b?.hours)} phút`, `${mins(a?.hours)} phút`);
  });

  const beforeDef = new Map((original?.defects || []).map((x: any) => [key(x, "defect"), x]));
  const afterDef = new Map((draft?.defects || []).map((x: any) => [key(x, "defect"), x]));
  new Set([...beforeDef.keys(), ...afterDef.keys()]).forEach(k => {
    const b: any = beforeDef.get(k); const a: any = afterDef.get(k);
    const name = a?.defect_name || a?.defect_code || b?.defect_name || b?.defect_code || "Lỗi NG";
    add("Lỗi NG", name, `${num(b?.quantity)} sp`, `${num(a?.quantity)} sp`);
  });
  return rows;
}

export default function ManagerReportEditProposals() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ReportEditProposal[]>([]);
  const [selected, setSelected] = useState<ReportEditProposal | null>(null);
  const [original, setOriginal] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    try { setLoading(true); setItems(await getReportEditProposals()); }
    catch (e: any) { showToast(e?.response?.data?.message || "Không thể tải đề xuất sửa", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const open = async (p: ReportEditProposal) => {
    try {
      const r = await getTempReportDetail(p.report_id);
      const proposed = normalize(p.proposed_data);
      setSelected(p);
      setOriginal(normalize(r));
      setProposal(clone(proposed));
      setDraft(clone(proposed));
      setRejectOpen(false);
      setRejectReason("");
    } catch (e: any) { showToast(e?.response?.data?.message || "Không thể tải báo cáo", "error"); }
  };

  // Chỉ true khi QUẢN LÝ đã sửa thêm sau khi mở đề xuất.
  const managerChanged = useMemo(() => JSON.stringify(proposal) !== JSON.stringify(draft), [proposal, draft]);
  const compare = useMemo(() => compareRows(original || {}, draft || {}), [original, draft]);
  const changedCount = compare.filter(x => x.changed).length;

  const approve = async () => {
    if (!selected) return;
    try {
      setBusy(true);
      await reviewReportEditProposal(selected.id, {
        decision: "approve",
        status_after: "approved",
        proposed_data: draft,
      });
      showToast(managerChanged ? "Đã sửa rồi duyệt báo cáo" : "Đã duyệt theo đề xuất của tổ trưởng", "success");
      setSelected(null); setDraft(null); setProposal(null); setOriginal(null);
      await load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Không thể duyệt đề xuất", "error");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!selected || rejectReason.trim().length < 2) {
      showToast("Vui lòng nhập lý do từ chối", "error"); return;
    }
    try {
      setBusy(true);
      await reviewReportEditProposal(selected.id, { decision: "reject", reason: rejectReason.trim() });
      showToast("Đã từ chối đề xuất sửa", "success");
      setSelected(null); setDraft(null); setProposal(null); setOriginal(null);
      setRejectOpen(false); setRejectReason("");
      await load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Không thể từ chối đề xuất", "error");
    } finally { setBusy(false); }
  };

  const set = (patch: any) => setDraft((d: any) => ({ ...d, ...patch }));
  const editList = (name: "defects" | "deductions", i: number, patch: any) =>
    setDraft((d: any) => ({ ...d, [name]: d[name].map((x: any, n: number) => n === i ? { ...x, ...patch } : x) }));

  const pendingItems = items.filter(x => x.status === "pending");

  return <div className="management-page report-proposals-page manager-proposals">
    <header className="proposal-page-head">
      <div>
        <h1>Đề xuất sửa báo cáo</h1>
        <p>Quản lý xem đề xuất của tổ trưởng, đối chiếu báo cáo cũ và nội dung đề xuất rồi duyệt hoặc sửa rồi duyệt.</p>
      </div>
    </header>

    <section className="proposal-workspace">
      <div className="proposal-list-card">
        <div className="proposal-card-head"><strong>Đề xuất chờ xử lý</strong><span>{pendingItems.length}</span></div>
        {loading ? <div className="proposal-empty">Đang tải...</div> : pendingItems.length === 0 ? <div className="proposal-empty">Không có đề xuất chờ xử lý.</div> :
          <div className="proposal-list">{pendingItems.map(p =>
            <button type="button" className={`proposal-list-item ${selected?.id === p.id ? "active" : ""}`} key={p.id} onClick={() => void open(p)}>
              <div><strong>Báo cáo #{p.report_id}</strong><span>{p.worker_name || p.worker_code || "---"} · {p.work_date || "---"} · Ca {p.shift || "-"}</span><small>Tổ trưởng: {p.proposer_name || p.proposer_username || "---"}</small></div>
              <em>Chờ xử lý</em>
            </button>)}
          </div>}
      </div>

      <div className="proposal-detail-card">
        {!selected ? <div className="proposal-empty">Chọn một đề xuất để xem và xử lý.</div> : <>
          <div className="proposal-detail-head">
            <div><h2>Đề xuất sửa #{selected.id}</h2><p>Báo cáo #{selected.report_id} · Tổ trưởng: {selected.proposer_name || selected.proposer_username || "---"}</p></div>
            <button type="button" onClick={() => setSelected(null)}>×</button>
          </div>

          <div className="proposal-detail-body">
            <section className="proposal-compare-section">
              <div className="proposal-section-title">
                <div><h3>Đối chiếu báo cáo</h3><p className="proposal-section-help">Bảng trái là dữ liệu đang lưu. Bảng phải là nội dung tổ trưởng đề xuất; nếu quản lý sửa thêm, bảng phải cập nhật ngay.</p></div>
                <strong>{changedCount} nội dung thay đổi</strong>
              </div>
              <div className="proposal-compare-grid">
                <CompareCard title="Báo cáo đang lưu" data={original} changedAgainst={draft} old />
                <CompareCard title={managerChanged ? "Nội dung quản lý sẽ duyệt" : "Nội dung tổ trưởng đề xuất"} data={draft} changedAgainst={original} />
              </div>
              <div className="proposal-legend"><span className="old-dot" /> Giá trị cũ bị thay đổi <span className="new-dot" /> Giá trị mới <span className="same-dot" /> Không thay đổi</div>
            </section>

            <section className="manager-edit-form">
              <div className="proposal-section-title">
                <div><h3>Kiểm tra / chỉnh sửa trước khi duyệt</h3><p className="proposal-section-help">Không sửa → <b>Duyệt</b>. Có sửa → <b>Sửa rồi duyệt</b>. Không có bước “Lưu, chờ duyệt”.</p></div>
              </div>
              {managerChanged && <div className="manager-change-notice">⚠️ <strong>Quản lý đã thay đổi nội dung đề xuất.</strong> Bấm <b>Sửa rồi duyệt</b> để ghi nhận nội dung hiện tại và duyệt báo cáo.</div>}

              <div className="proposal-grid">
                <label>Ngày báo cáo<input type="date" value={draft.work_date} onChange={e => set({ work_date: e.target.value })} /></label>
                <label>Ca<input value={draft.shift} onChange={e => set({ shift: e.target.value })} /></label>
                <label>Máy<input value={draft.machine_no} onChange={e => set({ machine_no: e.target.value })} /></label>
                <label>Sản phẩm<input value={draft.product_name} onChange={e => set({ product_name: e.target.value })} /></label>
                <label>Giờ làm thực tế<input type="number" min="0" step="0.01" value={draft.actual_time} onChange={e => set({ actual_time: Math.max(0, num(e.target.value)) })} /></label>
                <label>Sản lượng OK<input type="number" min="0" value={draft.tt_ok} onChange={e => set({ tt_ok: Math.max(0, num(e.target.value)) })} /></label>
              </div>

              <h3>Thời gian trừ</h3>
              {(draft.deductions || []).map((x: any, i: number) => <div className="proposal-row" key={key(x, "deduction")}>
                <input value={x.deduction_name || x.deduction_code || ""} readOnly />
                <input type="number" min="0" value={mins(x.hours)} onChange={e => editList("deductions", i, { hours: Math.max(0, num(e.target.value)) / 60 })} />
                <span>phút</span>
              </div>)}

              <h3>Lỗi NG</h3>
              {(draft.defects || []).map((x: any, i: number) => <div className="proposal-row" key={key(x, "defect")}>
                <input value={x.defect_name || x.defect_code || ""} readOnly />
                <input type="number" min="0" value={x.quantity} onChange={e => editList("defects", i, { quantity: Math.max(0, num(e.target.value)) })} />
                <span>sp</span>
              </div>)}

              <label className="proposal-note">Ghi chú<textarea rows={3} value={draft.note || ""} onChange={e => set({ note: e.target.value })} /></label>
            </section>

            {rejectOpen && <section className="proposal-reject-box">
              <h3>Lý do từ chối</h3>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Nhập lý do để tổ trưởng biết cần sửa gì..." />
              <div><button type="button" className="danger" onClick={() => void reject()} disabled={busy}>Xác nhận từ chối</button><button type="button" onClick={() => setRejectOpen(false)}>Hủy</button></div>
            </section>}
          </div>

          <footer className="proposal-actions manager-proposal-actions">
            <button type="button" onClick={() => setSelected(null)}>Hủy</button>
            <button type="button" className="danger" onClick={() => setRejectOpen(true)} disabled={busy}>Từ chối</button>
            <button type="button" className="primary" onClick={() => void approve()} disabled={busy}>{managerChanged ? "Sửa rồi duyệt" : "Duyệt"}</button>
          </footer>
        </>}
      </div>
    </section>
  </div>;
}

function CompareCard({ title, data, changedAgainst, old }: { title: string; data: any; changedAgainst: any; old?: boolean }) {
  const rows = compareRows(data || {}, changedAgainst || {});
  return <div className={`proposal-compare-card ${old ? "original" : "proposed"}`}>
    <div className="proposal-compare-card-head"><div><span>{old ? "PHIÊN BẢN HIỆN TẠI" : "PHIÊN BẢN ĐỀ XUẤT"}</span><strong>{title}</strong></div><em>{old ? "Giá trị cũ" : "Giá trị mới"}</em></div>
    <table className="proposal-compare-table"><thead><tr><th>Hạng mục</th><th>Giá trị</th></tr></thead><tbody>
      {rows.map((r, i) => <tr key={`${r.group}-${r.label}-${i}`}>
        <td><small>{r.group}</small><strong>{r.label}</strong></td>
        <td className={r.changed ? (old ? "changed-old" : "changed-new") : ""}>{old ? r.before : r.after}</td>
      </tr>)}
    </tbody></table>
  </div>;
}
