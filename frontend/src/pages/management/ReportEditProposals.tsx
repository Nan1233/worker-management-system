import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import { useToast } from "../../components/feedback/toastContext";
import { getTempReportDetail } from "../../services/productionService";
import {
  createReportEditProposal,
  deleteReportEditProposal,
  getReportEditProposals,
  updateReportEditProposal,
  type ReportEditProposal,
} from "../../services/reportEditProposalService";
import type { ProductionReport } from "../../types/production";
import "./ReportEditProposals.css";

const n = (v: unknown) => Number(v || 0);
const minutes = (hours: unknown) => Math.round(n(hours) * 60);
const dateText = (v?: string | null) => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "---";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function normalizeDraft(report: ProductionReport | Record<string, any>) {
  const value = report as any;
  return {
    work_date: String(value.work_date || "").slice(0, 10),
    shift: value.shift || "",
    machine_no: value.machine_no || "",
    product_name: value.product_name || "",
    actual_time: n(value.actual_time),
    tt_ok: n(value.tt_ok),
    note: value.note || "",
    deductions: (value.deductions || []).filter((x: any) => n(x.hours) > 0).map((x: any) => ({
      deduction_type_id: x.deduction_type_id || x.id,
      deduction_name: x.deduction_name || x.deduction_code || "Thời gian trừ",
      hours: n(x.hours),
    })),
    defects: (value.defects || []).filter((x: any) => n(x.quantity) > 0).map((x: any) => ({
      defect_type_id: x.defect_type_id || x.id,
      defect_name: x.defect_name || x.defect_code || "Lỗi NG",
      quantity: n(x.quantity),
    })),
  };
}

type CompareRow = {
  group: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

const normalized = (v: unknown) => String(v ?? "").trim();
const addCompare = (rows: CompareRow[], group: string, label: string, before: unknown, after: unknown) => {
  const b = normalized(before) || "---";
  const a = normalized(after) || "---";
  rows.push({ group, label, before: b, after: a, changed: b !== a });
};

function compareRows(original: any, proposed: any): CompareRow[] {
  const rows: CompareRow[] = [];
  addCompare(rows, "Thông tin chung", "Ngày báo cáo", dateText(original?.work_date), dateText(proposed?.work_date));
  addCompare(rows, "Thông tin chung", "Ca", original?.shift || "---", proposed?.shift || "---");
  addCompare(rows, "Thông tin chung", "Máy", original?.machine_no || "---", proposed?.machine_no || "---");
  addCompare(rows, "Thông tin chung", "Sản phẩm", original?.product_name || "---", proposed?.product_name || "---");
  addCompare(rows, "Sản xuất", "Giờ làm thực tế", `${n(original?.actual_time)} giờ`, `${n(proposed?.actual_time)} giờ`);
  addCompare(rows, "Sản xuất", "Sản lượng OK", n(original?.tt_ok), n(proposed?.tt_ok));
  addCompare(rows, "Sản xuất", "Ghi chú", original?.note || "---", proposed?.note || "---");

  const beforeDed = new Map((original?.deductions || []).map((x: any) => [String(x.deduction_type_id || x.id || x.deduction_name), x]));
  const afterDed = new Map((proposed?.deductions || []).map((x: any) => [String(x.deduction_type_id || x.id || x.deduction_name), x]));
  const dedKeys = new Set([...beforeDed.keys(), ...afterDed.keys()]);
  dedKeys.forEach(key => {
    const b: any = beforeDed.get(key);
    const a: any = afterDed.get(key);
    const name = a?.deduction_name || b?.deduction_name || "Khoản thời gian trừ";
    addCompare(rows, "Thời gian trừ", name, `${minutes(b?.hours)} phút`, `${minutes(a?.hours)} phút`);
  });

  const beforeDef = new Map((original?.defects || []).map((x: any) => [String(x.defect_type_id || x.id || x.defect_name), x]));
  const afterDef = new Map((proposed?.defects || []).map((x: any) => [String(x.defect_type_id || x.id || x.defect_name), x]));
  const defKeys = new Set([...beforeDef.keys(), ...afterDef.keys()]);
  defKeys.forEach(key => {
    const b: any = beforeDef.get(key);
    const a: any = afterDef.get(key);
    const name = a?.defect_name || b?.defect_name || "Lỗi NG";
    addCompare(rows, "Lỗi NG", name, `${n(b?.quantity)} sp`, `${n(a?.quantity)} sp`);
  });

  return rows;
}

export default function ReportEditProposals() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const role = String(getStoredUser()?.role || "manager").toLowerCase();
  const base = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
  const [items, setItems] = useState<ReportEditProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportEditProposal | null>(null);
  const [reportId, setReportId] = useState("");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [original, setOriginal] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setItems(await getReportEditProposals());
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể tải đề xuất sửa", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectItem = async (item: ReportEditProposal) => {
    try {
      setLoadingDetail(true);
      const report = await getTempReportDetail(item.report_id);
      const before = normalizeDraft(report);
      setSelected(item);
      setReason(item.reason);
      setOriginal(before);
      setDraft(normalizeDraft(item.proposed_data || {}));
      setCreating(false);
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể tải báo cáo gốc", "error");
    } finally {
      setLoadingDetail(false);
    }
  };

  const startCreate = async () => {
    const id = Number(reportId);
    if (!Number.isInteger(id) || id <= 0) {
      showToast("Nhập đúng mã ID báo cáo", "error");
      return;
    }
    try {
      setSaving(true);
      const report = await getTempReportDetail(id);
      const before = normalizeDraft(report);
      setSelected(null);
      setCreating(true);
      setReason("");
      setOriginal(clone(before));
      setDraft(clone(before));
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể tải báo cáo để lập đề xuất", "error");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (reason.trim().length < 2) {
      showToast("Vui lòng nhập nội dung đề xuất sửa", "error");
      return;
    }
    const changes = compareRows(original || {}, draft).filter(x => x.changed);
    if (changes.length === 0) {
      showToast("Chưa có nội dung nào thay đổi", "error");
      return;
    }
    const payload = {
      report_id: Number(selected?.report_id || reportId),
      reason: reason.trim(),
      proposed_data: draft,
    };
    try {
      setSaving(true);
      if (creating) {
        await createReportEditProposal(payload);
        showToast("Đã thêm đề xuất sửa", "success");
      } else if (selected) {
        await updateReportEditProposal(selected.id, {
          reason: payload.reason,
          proposed_data: draft,
        });
        showToast("Đã cập nhật đề xuất sửa", "success");
      }
      setSelected(null);
      setDraft(null);
      setOriginal(null);
      setCreating(false);
      setReportId("");
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể lưu đề xuất sửa", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: ReportEditProposal) => {
    if (!window.confirm(`Xóa đề xuất sửa cho báo cáo #${item.report_id}?`)) return;
    try {
      await deleteReportEditProposal(item.id);
      showToast("Đã xóa đề xuất sửa", "success");
      if (selected?.id === item.id) {
        setSelected(null);
        setDraft(null);
        setOriginal(null);
      }
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể xóa đề xuất sửa", "error");
    }
  };

  const totalNg = useMemo(() => (draft?.defects || []).reduce((s: number, x: any) => s + n(x.quantity), 0), [draft]);
  const totalDeduction = useMemo(() => (draft?.deductions || []).reduce((s: number, x: any) => s + n(x.hours), 0), [draft]);
  const compare = useMemo(() => compareRows(original || {}, draft || {}), [original, draft]);
  const changedCount = compare.filter(x => x.changed).length;
  const clearSelection = () => {
    setSelected(null);
    setDraft(null);
    setOriginal(null);
    setCreating(false);
  };

  const updateDraft = (patch: any) => setDraft((d: any) => ({ ...d, ...patch }));

  return (
    <div className="management-page report-proposals-page">
      <header className="proposal-page-head">
        <div>
          <button type="button" className="proposal-back" onClick={() => navigate(`${base}/reports`)}>← Chờ duyệt</button>
          <h1>Đề xuất sửa báo cáo</h1>
          <p>Hai bảng đặt cạnh nhau, cùng cấu trúc. Nội dung được sửa sẽ được tô nổi bật để dễ đối chiếu.</p>
        </div>
        <div className="proposal-create-bar">
          <input value={reportId} onChange={e => setReportId(e.target.value.replace(/\D/g, ""))} placeholder="ID báo cáo" />
          <button type="button" onClick={() => void startCreate()} disabled={saving}>+ Thêm đề xuất</button>
        </div>
      </header>

      <section className="proposal-workspace">
        <div className="proposal-list-card">
          <div className="proposal-card-head"><strong>Danh sách đề xuất</strong><span>{items.length}</span></div>
          {loading ? <div className="proposal-empty">Đang tải...</div> : items.length === 0 ? <div className="proposal-empty">Chưa có đề xuất sửa.</div> : (
            <div className="proposal-list">
              {items.map(item => (
                <button type="button" key={item.id} className={`proposal-list-item ${selected?.id === item.id ? "active" : ""}`} onClick={() => void selectItem(item)}>
                  <div>
                    <strong>Báo cáo #{item.report_id}</strong>
                    <span>{item.worker_name || item.worker_code || "---"} · {dateText(item.work_date)} · Ca {item.shift || "-"}</span>
                  </div>
                  <em>{item.proposer_role === "lead" ? "Tổ trưởng" : "Quản lý"}</em>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="proposal-detail-card">
          {!draft ? <div className="proposal-empty">Chọn một đề xuất hoặc nhập ID báo cáo để thêm mới.</div> : (
            <>
              <div className="proposal-detail-head">
                <div>
                  <h2>{creating ? "Thêm đề xuất sửa" : `Đề xuất sửa #${selected?.id}`}</h2>
                  <p>Báo cáo #{selected?.report_id || reportId}</p>
                </div>
                <button type="button" onClick={clearSelection}>×</button>
              </div>

              <div className="proposal-detail-body">
                {loadingDetail && <div className="proposal-loading">Đang tải dữ liệu báo cáo gốc...</div>}

                {!creating && (
                  <section className="proposal-compare-section">
                    <div className="proposal-section-title">
                      <div><h3>Đối chiếu báo cáo</h3><p className="proposal-section-help">Hai bảng giống nhau để đối chiếu trực tiếp. Ô nào thay đổi sẽ được tô màu.</p></div>
                      <strong>{changedCount} nội dung thay đổi</strong>
                    </div>

                    <div className="proposal-compare-grid">
                      <div className="proposal-compare-card original">
                        <div className="proposal-compare-card-head"><div><span>PHIÊN BẢN HIỆN TẠI</span><strong>Báo cáo đang lưu</strong></div><em>Giá trị cũ</em></div>
                        <table className="proposal-compare-table"><thead><tr><th>Hạng mục</th><th>Giá trị</th></tr></thead><tbody>
                          {compare.map((row, i) => <tr key={`old-${row.group}-${row.label}-${i}`}>
                            <td><small>{row.group}</small><strong>{row.label}</strong></td>
                            <td className={row.changed ? "changed-old" : ""}>{row.before}</td>
                          </tr>)}
                        </tbody></table>
                      </div>

                      <div className="proposal-compare-card proposed">
                        <div className="proposal-compare-card-head"><div><span>PHIÊN BẢN ĐỀ XUẤT</span><strong>Nội dung sau khi sửa</strong></div><em>Giá trị mới</em></div>
                        <table className="proposal-compare-table"><thead><tr><th>Hạng mục</th><th>Giá trị</th></tr></thead><tbody>
                          {compare.map((row, i) => <tr key={`new-${row.group}-${row.label}-${i}`}>
                            <td><small>{row.group}</small><strong>{row.label}</strong></td>
                            <td className={row.changed ? "changed-new" : ""}>{row.after}</td>
                          </tr>)}
                        </tbody></table>
                      </div>
                    </div>

                    <div className="proposal-legend"><span className="old-dot" /> Giá trị cũ bị thay đổi <span className="new-dot" /> Giá trị đề xuất mới <span className="same-dot" /> Không thay đổi</div>
                    <div className="proposal-reason-box"><strong>Lý do đề xuất</strong><p>{reason || "---"}</p></div>
                  </section>
                )}

                <section>
                  <h3>{creating ? "Nội dung đề xuất mới" : "Giá trị sau khi sửa"}</h3>
                  <div className="proposal-grid">
                    <label>Ngày báo cáo<input type="date" value={draft.work_date} onChange={e => updateDraft({ work_date: e.target.value })} /></label>
                    <label>Ca<select value={draft.shift} onChange={e => updateDraft({ shift: e.target.value })}><option value="">---</option><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
                    <label>Máy<input value={draft.machine_no} onChange={e => updateDraft({ machine_no: e.target.value })} /></label>
                    <label>Sản phẩm<input value={draft.product_name} onChange={e => updateDraft({ product_name: e.target.value })} /></label>
                    <label>Giờ làm thực tế<input type="number" min="0" step="0.01" value={draft.actual_time} onChange={e => updateDraft({ actual_time: Math.max(0, n(e.target.value)) })} /></label>
                    <label>Sản lượng OK<input type="number" min="0" value={draft.tt_ok} onChange={e => updateDraft({ tt_ok: Math.max(0, n(e.target.value)) })} /></label>
                  </div>
                </section>

                <section>
                  <div className="proposal-section-title"><h3>Chi tiết thời gian trừ</h3><strong>Tổng: {minutes(totalDeduction)} phút</strong></div>
                  {(draft.deductions || []).map((x: any, i: number) => (
                    <div className="proposal-row" key={x.deduction_type_id || i}>
                      <input value={x.deduction_name} onChange={e => setDraft((d: any) => ({ ...d, deductions: d.deductions.map((a: any, j: number) => j === i ? { ...a, deduction_name: e.target.value } : a) }))} />
                      <input type="number" min="0" value={minutes(x.hours)} onChange={e => { const mins = Math.max(0, n(e.target.value)); setDraft((d: any) => ({ ...d, deductions: d.deductions.map((a: any, j: number) => j === i ? { ...a, hours: mins / 60 } : a) })); }} />
                      <span>phút</span>
                      <button type="button" onClick={() => setDraft((d: any) => ({ ...d, deductions: d.deductions.filter((_: any, j: number) => j !== i) }))}>Xóa</button>
                    </div>
                  ))}
                  <button type="button" className="proposal-add-line" onClick={() => setDraft((d: any) => ({ ...d, deductions: [...(d.deductions || []), { deduction_name: "Khoản trừ mới", hours: 0 }] }))}>+ Thêm khoản thời gian trừ</button>
                </section>

                <section>
                  <div className="proposal-section-title"><h3>Chi tiết lỗi NG</h3><strong>Tổng NG: {Math.round(totalNg)}</strong></div>
                  {(draft.defects || []).map((x: any, i: number) => (
                    <div className="proposal-row" key={x.defect_type_id || i}>
                      <input value={x.defect_name} onChange={e => setDraft((d: any) => ({ ...d, defects: d.defects.map((a: any, j: number) => j === i ? { ...a, defect_name: e.target.value } : a) }))} />
                      <input type="number" min="0" value={x.quantity} onChange={e => { const q = Math.max(0, n(e.target.value)); setDraft((d: any) => ({ ...d, defects: q === 0 ? d.defects.filter((_: any, j: number) => j !== i) : d.defects.map((a: any, j: number) => j === i ? { ...a, quantity: q } : a) })); }} />
                      <span>sp</span>
                      <button type="button" onClick={() => setDraft((d: any) => ({ ...d, defects: d.defects.filter((_: any, j: number) => j !== i) }))}>Xóa</button>
                    </div>
                  ))}
                  <button type="button" className="proposal-add-line" onClick={() => setDraft((d: any) => ({ ...d, defects: [...(d.defects || []), { defect_name: "Lỗi NG mới", quantity: 0 }] }))}>+ Thêm loại lỗi NG</button>
                </section>

                <section>
                  <h3>Nội dung đề xuất sửa</h3>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Ghi rõ nội dung cần sửa và lý do..." />
                  <label className="proposal-note">Ghi chú<input value={draft.note || ""} onChange={e => updateDraft({ note: e.target.value })} /></label>
                </section>
              </div>

              <footer className="proposal-actions">
                <button type="button" onClick={clearSelection}>Hủy</button>
                <button type="button" className="primary" onClick={() => void save()} disabled={saving}>{saving ? "Đang lưu..." : creating ? "Đề xuất sửa" : "Lưu đề xuất"}</button>
                {selected && <button type="button" className="danger" onClick={() => void remove(selected)}>Xóa đề xuất</button>}
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
