import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import api from "../../services/api";
import { getApprovedReports } from "../../services/productionService";
import { getActivities, type ActivityItem } from "../../services/systemService";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getStoredUser } from "../../utils/authStorage";
import "./Workers.css";

type Person = {
  id: number;
  username: string;
  full_name: string;
  role: "manager" | "lead" | "worker";
  status: string;
  worker_code?: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  training_percent?: number;
  process_ids?: string | null;
  process_names?: string | null;
};

type MonthlyTT = { percent: number | null; hours: number };

type Process = { id: number; process_name: string; process_code?: string };

type FormState = {
  id?: number;
  role: "lead" | "worker";
  username: string;
  password: string;
  full_name: string;
  worker_code: string;
  phone: string;
  department: string;
  position: string;
  training_percent: string;
  process_ids: number[];
  status: "active" | "inactive";
};

const emptyForm: FormState = {
  role: "lead",
  username: "",
  password: "",
  full_name: "",
  worker_code: "",
  phone: "",
  department: "Sản xuất",
  position: "Tổ trưởng",
  training_percent: "100",
  process_ids: [],
  status: "active",
};

const roleText = (role: string) =>
  role === "lead" ? "Tổ trưởng" : role === "worker" ? "Công nhân" : "Quản lý";

const statusText = (status: string) =>
  status === "active" ? "Đang hoạt động" : "Ngừng hoạt động";

const processIds = (value?: string | number[] | null) => {
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return processIds(parsed);
  } catch { /* Legacy data can contain a comma-separated list. */ }
  return [...new Set(raw.split(/[;,]/).map(Number).filter(id => Number.isInteger(id) && id > 0))];
};

const activityAction = (action: string) =>
  String(action || "").toUpperCase() === "LOGOUT" ? "Đăng xuất" : "Đăng nhập";

export default function Workers() {
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canCreate = can("USER_CREATE");
  const canEdit = can("USER_EDIT");
  const isAdminOps = String(getStoredUser()?.role || "").toLowerCase() === "admin_ops";

  const [people, setPeople] = useState<Person[]>([]);
  const [monthlyTTByWorkerCode, setMonthlyTTByWorkerCode] = useState<Record<string, MonthlyTT>>({});
  const [processes, setProcesses] = useState<Process[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "lead" | "worker" | "activity">("all");
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "lead" | "worker">("all");
  const [processFilter, setProcessFilter] = useState("all");
  const [modal, setModal] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const personnelRequestSeqRef = useRef(0);
  const activityRequestSeqRef = useRef(0);
  const [loadError, setLoadError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [formError, setFormError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [transferError, setTransferError] = useState(false);
  const actionBusy = saving || transferBusy || promotingId !== null || deactivatingId !== null;

  const load = async () => {
    const seq = ++personnelRequestSeqRef.current;
    setLoading(true); setLoadError("");
    try {
      const [usersResponse, processesResponse] = await Promise.all([
        api.get("/users"), api.get("/users/options/processes"),
      ]);
      if (seq !== personnelRequestSeqRef.current) return;
      if (!Array.isArray(usersResponse.data?.data) || !Array.isArray(processesResponse.data?.data)) throw new Error("Dữ liệu nhân sự hoặc công đoạn không hợp lệ.");
      setPeople(usersResponse.data.data);
      setProcesses(processesResponse.data.data);
    } catch (e: any) {
      if (seq === personnelRequestSeqRef.current) setLoadError(e?.response?.data?.message || e?.message || "Không thể tải dữ liệu nhân sự");
    } finally {
      if (seq === personnelRequestSeqRef.current) setLoading(false);
    }
  };

  const loadActivities = async () => {
    const seq = ++activityRequestSeqRef.current;
    setActivityLoading(true); setActivityError("");
    try {
      const rows = await getActivities({ limit: 100 });
      if (seq === activityRequestSeqRef.current) setActivities(rows.filter(row => ["LOGIN", "LOGOUT"].includes(String(row.action || "").toUpperCase())));
    } catch (e: any) {
      if (seq === activityRequestSeqRef.current) setActivityError(e?.response?.data?.message || "Không thể tải lịch sử đăng nhập/đăng xuất");
    } finally {
      if (seq === activityRequestSeqRef.current) setActivityLoading(false);
    }
  };

  useEffect(() => { void load(); return () => { personnelRequestSeqRef.current += 1; activityRequestSeqRef.current += 1; }; }, []);

  // % TT tháng chỉ áp dụng cho công nhân: trung bình gia quyền theo giờ
  // của các báo cáo đã duyệt từ ngày đầu tháng đến hôm nay.
  useEffect(() => {
    let alive = true;
    const loadMonthlyTT = async () => {
      const now = new Date();
      const dateTo = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      const dateFrom = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), "01"].join("-");
      try {
        const firstPage = await getApprovedReports({ dateFrom, dateTo, page: 1, pageSize: 100 });
        const reports = [...firstPage.data];
        for (let page = 2; page <= firstPage.pagination.total_pages; page += 1) {
          const result = await getApprovedReports({ dateFrom, dateTo, page, pageSize: 100 });
          reports.push(...result.data);
        }
        const totals: Record<string, { weighted: number; hours: number }> = {};
        for (const report of reports as any[]) {
          const code = String(report.worker_code || "").trim();
          const hours = Number(report.actual_time ?? report.actual_hours ?? 0);
          if (!code || !Number.isFinite(hours) || hours <= 0) continue;
          const standard = Number(report.standard_output ?? report.target_output ?? 0);
          const actual = Number(report.actual_output ?? ((report.tt_ok != null || report.tt_ng != null) ? Number(report.tt_ok ?? 0) + Number(report.tt_ng ?? 0) : report.tt ?? 0));
          const storedTtDinhMuc = report.tt_dinh_muc;
          const ttDinhMuc = storedTtDinhMuc !== null && storedTtDinhMuc !== undefined && storedTtDinhMuc !== ""
            ? Number(storedTtDinhMuc)
            : standard > 0 && hours > 0 ? standard * hours : 0;
          const rawPercent = report.nang_suat_percent ?? report.nang_suat_percent_snapshot ?? report.productivity_percent;
          const parsedPercent = rawPercent !== null && rawPercent !== undefined && rawPercent !== ""
            ? Number(rawPercent)
            : NaN;
          const percent = Number.isFinite(parsedPercent)
            ? parsedPercent
            : ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0;
          if (!Number.isFinite(percent) || percent < 0) continue;
          if (!totals[code]) totals[code] = { weighted: 0, hours: 0 };
          totals[code].weighted += percent * hours;
          totals[code].hours += hours;
        }
        const result: Record<string, MonthlyTT> = {};
        for (const [code, total] of Object.entries(totals)) {
          result[code] = { percent: total.hours > 0 ? total.weighted / total.hours : null, hours: total.hours };
        }
        if (alive) setMonthlyTTByWorkerCode(result);
      } catch {
        if (alive) setMonthlyTTByWorkerCode({});
      }
    };
    void loadMonthlyTT();
    const timer = window.setInterval(() => void loadMonthlyTT(), 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (tab === "activity") void loadActivities();
  }, [tab]);

  const leads = useMemo(() => people.filter((p) => p.role === "lead"), [people]);
  const workers = useMemo(() => people.filter((p) => p.role === "worker"), [people]);

  const filteredPeople = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return people.filter((person) => {
      if (person.role === "manager") return false;
      if (tab === "lead" && person.role !== "lead") return false;
      if (tab === "worker" && person.role !== "worker") return false;
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      if (processFilter !== "all" && !processIds(person.process_ids).includes(Number(processFilter))) return false;
      if (!query) return true;
      return [
        person.username,
        person.full_name,
        person.worker_code,
        person.phone,
        person.process_names,
        person.department,
      ].join(" ").toLowerCase().includes(query);
    });
  }, [people, keyword, tab, roleFilter, processFilter]);

  const create = (role: "lead" | "worker") => {
    if (actionBusy) return;
    setFormError("");
    setModal({ ...emptyForm, role, position: role === "worker" ? "Công nhân" : "Tổ trưởng" });
  };

  const edit = (person: Person) => {
    if (actionBusy) return;
    setFormError("");
    setModal({
      id: person.id,
      role: person.role === "lead" ? "lead" : "worker",
      username: person.username || "",
      password: "",
      full_name: person.full_name || "",
      worker_code: person.worker_code || "",
      phone: person.phone || "",
      department: person.department || "Sản xuất",
      position: person.position || roleText(person.role),
      training_percent: String(person.training_percent ?? 100),
      process_ids: processIds(person.process_ids),
      status: person.status === "inactive" ? "inactive" : "active",
    });
  };

  const save = async () => {
    if (!modal || actionBusy) return;
    if (!modal.full_name.trim() || !modal.username.trim()) { setFormError("Vui lòng nhập họ tên và tên đăng nhập."); return; }
    if (modal.role === "lead" && !modal.id && !modal.password.trim()) { setFormError("Tổ trưởng mới cần mật khẩu."); return; }
    if (modal.role === "worker") {
      if (!modal.worker_code.trim()) { setFormError("Vui lòng nhập mã công nhân."); return; }
      const percentage = Number(modal.training_percent);
      if (!modal.training_percent.trim() || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        setFormError("% học việc phải từ 0 đến 100."); return;
      }
    }
    if (!(isAdminOps && modal.id) && modal.process_ids.length === 0) { setFormError("Vui lòng chọn ít nhất một công đoạn."); return; }
    setFormError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: modal.username.trim(),
        full_name: modal.full_name.trim(),
        status: modal.status,
      };
      // Existing process assignments may include scopes this admin_ops account
      // does not manage. Do not submit a replacement list when editing users.
      if (!(isAdminOps && modal.id)) body.process_ids = modal.process_ids;
      if (modal.password) body.password = modal.password;
      if (modal.role === "worker") {
        Object.assign(body, {
          worker_code: modal.worker_code,
          phone: modal.phone,
          department: modal.department,
          position: modal.position,
          training_percent: Number(modal.training_percent),
        });
      }
      if (modal.id) await api.put(`/users/${modal.id}`, body);
      else {
        body.role = modal.role;
        body.password = modal.role === "worker" ? crypto.randomUUID() : modal.password;
        await api.post("/users", body);
      }
      showToast(modal.id ? "Đã cập nhật nhân sự" : "Đã thêm nhân sự", "success");
      setModal(null);
      await load();
    } catch (error: any) {
      const message = error?.response?.data?.message || "Không thể lưu nhân sự";
      setFormError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const promoteWorkerToLead = async (person: Person) => {
    if (!canEdit || person.role !== "worker" || actionBusy) return;
    if (!window.confirm(`Nâng ${person.full_name || person.username} lên Tổ trưởng?\n\nGiữ nguyên tài khoản, lịch sử báo cáo và toàn bộ công đoạn hiện tại.`)) return;
    setPromotingId(person.id);
    try {
      const response = await api.post(`/users/${person.id}/promote-lead`);
      const initialPassword = String(response.data?.data?.initial_password || "");
      showToast(response.data?.message || "Đã nâng lên Tổ trưởng", "success");
      if (initialPassword) window.alert(`Mật khẩu khởi tạo (chỉ hiển thị lần này):\\n\\n${initialPassword}\\n\\nHãy gửi mật khẩu này cho người được nâng và yêu cầu đổi mật khẩu ngay sau khi đăng nhập.`);
      setModal(null);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể nâng công nhân lên Tổ trưởng", "error");
    } finally {
      setPromotingId(null);
    }
  };

  const remove = async (person: Person) => {
    if (!canEdit || actionBusy || !window.confirm(`Ngừng hoạt động tài khoản ${roleText(person.role)} ${person.full_name}? Tài khoản có thể được mở lại sau.`)) return;
    setDeactivatingId(person.id);
    try {
      await api.put(`/users/${person.id}`, { status: "inactive" });
      showToast("Đã chuyển nhân sự sang Ngừng hoạt động", "success");
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể ngừng hoạt động tài khoản", "error");
    } finally { setDeactivatingId(null); }
  };

  const exportExcel = async () => {
    if (actionBusy) return;
    setTransferBusy(true); setTransferError(false);
    setTransferMessage("");
    try {
      const response = await api.get("/users/export/excel", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `KTC_NhanSu_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTransferMessage("Đã xuất dữ liệu nhân sự.");
    } catch (error: any) {
      let message = "Không thể xuất Excel nhân sự.";
      const data = error?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          message = parsed?.message || parsed?.error || message;
        } catch {
          if (data.size > 0) message = "Máy chủ trả về lỗi khi tạo file Excel. Vui lòng thử lại hoặc kiểm tra log backend.";
        }
      } else if (data?.message) {
        message = data.message;
      }
      setTransferError(true);
      setTransferMessage(message);
    } finally {
      setTransferBusy(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file || actionBusy) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setTransferError(true);
      setTransferMessage("Chỉ hỗ trợ file Excel .xlsx.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setTransferBusy(true); setTransferError(false);
    setTransferMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Không đọc được file"));
        reader.readAsDataURL(file);
      });
      const response = await api.post("/users/import/excel", { file_base64: base64 });
      setTransferMessage(response.data?.message || "Đã nhập Excel nhân sự.");
      await load();
    } catch (error: any) {
      const data = error?.response?.data;
      setTransferError(true);
      setTransferMessage(data?.errors?.length ? `${data.message || "File không hợp lệ"} ${data.errors.slice(0, 2).join("; ")}` : data?.message || "Không thể nhập Excel nhân sự.");
    } finally {
      setTransferBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section className="personnel-page manager-page">
      <header className="personnel-header">
        <div>
          <h1>Nhân sự</h1>
          <p>Quản lý tổ trưởng, công nhân và phân công công đoạn</p>
        </div>
        {canCreate && (
          <div className="personnel-header-actions">
            <button className="personnel-primary" onClick={() => create("lead")}><Plus size={15} /> Tổ trưởng</button>
            <button className="personnel-secondary" onClick={() => create("worker")}><Plus size={15} /> Công nhân</button>
          </div>
        )}
      </header>

      <nav className="personnel-tabs" aria-label="Danh mục nhân sự">
        <button className={tab === "all" ? "active" : ""} onClick={() => { setTab("all"); setRoleFilter("all"); }}>Tất cả ({leads.length + workers.length})</button>
        <button className={tab === "lead" ? "active" : ""} onClick={() => { setTab("lead"); setRoleFilter("lead"); }}>Tổ trưởng ({leads.length})</button>
        <button className={tab === "worker" ? "active" : ""} onClick={() => { setTab("worker"); setRoleFilter("worker"); }}>Công nhân ({workers.length})</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Lịch sử</button>
      </nav>

      {tab !== "activity" ? (
        <>
          <div className="personnel-summary">
            <span><Users size={15} /> <b>{leads.length + workers.length}</b> nhân sự</span>
            <i />
            <span>{workers.length} công nhân</span>
            <i />
            <span>{leads.length} tổ trưởng</span>
            <i />
            <span>{processes.length} công đoạn</span>
          </div>

          <div className="personnel-toolbar">
            <button type="button" className="personnel-secondary personnel-refresh" disabled={loading || actionBusy} onClick={() => void load()}>Làm mới</button>
            <div className="personnel-search"><Search size={16} /><input aria-label="Tìm kiếm nhân sự" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm tên hoặc mã nhân sự..." /></div>
            <select aria-label="Lọc vai trò" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "all" | "lead" | "worker")}>
              <option value="all">Tất cả vai trò</option>
              <option value="lead">Tổ trưởng</option>
              <option value="worker">Công nhân</option>
            </select>
            <select aria-label="Lọc công đoạn" value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
              <option value="all">Tất cả công đoạn</option>
              {processes.map((process) => <option key={process.id} value={process.id}>{process.process_name}</option>)}
            </select>
            <button className="personnel-secondary" disabled={transferBusy} onClick={() => void exportExcel()}><Download size={15} /> Xuất Excel</button>
            {canCreate && !isAdminOps && <button className="personnel-primary" disabled={transferBusy} onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Nhập Excel</button>}
            <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={(e) => void handleImportFile(e.target.files?.[0] || null)} />
          </div>

          {transferMessage && <div role={transferError ? "alert" : "status"} className={`personnel-transfer-message ${transferError ? "error" : "success"}`}><FileSpreadsheet size={14} /> {transferMessage}</div>}

          {loading ? <div className="personnel-state" role="status">Đang tải dữ liệu nhân sự...</div> : loadError ? <div className="personnel-state" role="alert">{loadError} <button type="button" className="personnel-secondary" onClick={() => void load()}>Thử tải lại</button></div> : <section className="personnel-card personnel-directory-card">
            <div className="card-head"><div><h2>{tab === "lead" ? `Tổ trưởng (${filteredPeople.length})` : tab === "worker" ? `Công nhân (${filteredPeople.length})` : `Danh sách nhân sự (${filteredPeople.length})`}</h2><p>Danh sách được phân quyền theo các công đoạn quản lý phụ trách</p></div></div>
            <PersonTable rows={filteredPeople} monthlyTTByWorkerCode={monthlyTTByWorkerCode} canEdit={canEdit} canPromote={!isAdminOps} onEdit={edit} onDelete={remove} onPromote={promoteWorkerToLead} promotingId={promotingId} />
          </section>}
        </>
      ) : (
        <section className="personnel-card personnel-directory-card">
          <div className="card-head"><div><h2>Lịch sử đăng nhập / đăng xuất</h2><p>Nhật ký phiên làm việc của tài khoản nhân sự</p></div></div>
          {activityLoading ? <div className="personnel-state compact" role="status">Đang tải lịch sử...</div> : activityError ? <div className="personnel-state compact" role="alert">{activityError} <button type="button" className="personnel-secondary" onClick={() => void loadActivities()}>Thử tải lại</button></div> : <Activity rows={activities} />}
        </section>
      )}

      {modal && <div className="personnel-modal-backdrop"><div className="personnel-modal" role="dialog" aria-modal="true" aria-labelledby="personnel-dialog-title">
        <div className="modal-head"><div><h2 id="personnel-dialog-title">{modal.id ? "Sửa" : "Thêm"} {roleText(modal.role)}</h2></div><button type="button" aria-label="Đóng biểu mẫu" disabled={actionBusy} onClick={() => setModal(null)}><X size={18} /></button></div>
        {formError && <div className="personnel-form-error" role="alert">{formError}</div>}
        <div className="modal-grid">
          <label>Họ và tên<input value={modal.full_name} onChange={(e) => setModal({ ...modal, full_name: e.target.value })} /></label>
          <label>Tên đăng nhập<input value={modal.username} onChange={(e) => setModal({ ...modal, username: e.target.value })} /></label>
          {modal.role === "lead" && <label>Mật khẩu{modal.id && <small> (để trống nếu không đổi)</small>}<input type="password" value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} /></label>}
          {modal.role === "worker" && <>
            <label>Mã công nhân<input value={modal.worker_code} onChange={(e) => setModal({ ...modal, worker_code: e.target.value })} /></label>
            <label>Số điện thoại<input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} /></label>
            <label>Bộ phận<input value={modal.department} onChange={(e) => setModal({ ...modal, department: e.target.value })} /></label>
            <label>Vị trí<input value={modal.position} onChange={(e) => setModal({ ...modal, position: e.target.value })} /></label>
            <label>% học việc<input type="number" min="0" max="100" value={modal.training_percent} onChange={(e) => setModal({ ...modal, training_percent: e.target.value })} /></label>
          </>}
          <label>Trạng thái<select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value as "active" | "inactive" })}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
          {isAdminOps && modal.id ? (
            <div className="modal-processes">
              <span>Công đoạn phụ trách</span>
              <p>Admin vận hành không được thay đổi phân công công đoạn của tài khoản hiện có. Các phân công hiện tại sẽ được giữ nguyên.</p>
            </div>
          ) : (
            <div className="modal-processes"><span>Công đoạn phụ trách</span><div>{processes.map((process) => <label key={process.id}><input type="checkbox" checked={modal.process_ids.includes(process.id)} onChange={(e) => setModal({ ...modal, process_ids: e.target.checked ? [...modal.process_ids, process.id] : modal.process_ids.filter((id) => id !== process.id) })} />{process.process_name}</label>)}</div></div>
          )}
        </div>
        <div className="modal-actions">
          {modal.role === "worker" && modal.id && canEdit && !isAdminOps && <button type="button" className="personnel-secondary" disabled={saving || promotingId !== null} onClick={() => { const person = people.find((p) => p.id === modal.id); if (person) void promoteWorkerToLead(person); }}><ShieldCheck size={15} /> {promotingId === modal.id ? "Đang nâng..." : "Nâng lên Tổ trưởng"}</button>}
          <button type="button" disabled={actionBusy} onClick={() => setModal(null)}>Hủy</button>
          <button type="button" className="personnel-primary" disabled={saving || promotingId !== null} onClick={() => void save()}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
        </div>
      </div></div>}
    </section>
  );
}

function PersonTable({ rows, monthlyTTByWorkerCode, canEdit, canPromote, onEdit, onDelete, onPromote, promotingId }: { rows: Person[]; monthlyTTByWorkerCode: Record<string, MonthlyTT>; canEdit: boolean; canPromote: boolean; onEdit: (p: Person) => void; onDelete: (p: Person) => void; onPromote: (p: Person) => void; promotingId: number | null }) {
  return <div className="personnel-table-wrap"><table className="personnel-table"><thead><tr><th>#</th><th>Nhân sự</th><th>Mã</th><th>Vai trò</th><th>Công đoạn phụ trách</th><th>% học việc</th><th>% TT tháng</th><th>SĐT</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    {rows.length ? rows.map((person, index) => <tr key={person.id}>
      <td>{index + 1}</td>
      <td><strong>{person.full_name || "—"}</strong><small>{person.username}</small></td>
      <td>{person.worker_code || "—"}</td>
      <td><span className={`role-pill ${person.role}`}>{roleText(person.role)}</span></td>
      <td className="process-cell">{person.process_names || "Chưa phân công"}</td>
      <td>{person.role === "worker" ? <span className={`training-pill ${Number(person.training_percent ?? 100) >= 100 ? "complete" : "learning"}`}>{Number(person.training_percent ?? 100)}%</span> : "—"}</td>
      <td>{person.role === "worker" ? (monthlyTTByWorkerCode[String(person.worker_code || "").trim()]?.percent == null ? "—" : `${monthlyTTByWorkerCode[String(person.worker_code || "").trim()].percent!.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`) : "—"}</td>
      <td>{person.phone || "—"}</td>
      <td><span className={`person-status ${person.status}`}>{statusText(person.status)}</span></td>
      <td><div className="row-actions">{canEdit && <><button type="button" title="Sửa" onClick={() => onEdit(person)} disabled={promotingId !== null}><Pencil size={14} /></button>{canPromote && person.role === "worker" && <button type="button" title="Nâng lên Tổ trưởng" onClick={() => void onPromote(person)} disabled={promotingId !== null}><ShieldCheck size={14} /></button>}<button type="button" className="danger" title="Xóa" onClick={() => void onDelete(person)} disabled={promotingId !== null}><Trash2 size={14} /></button></>}</div></td>
    </tr>) : <tr><td colSpan={10} className="empty">Không có dữ liệu</td></tr>}
  </tbody></table></div>;
}

function Activity({ rows }: { rows: ActivityItem[] }) {
  return <div className="activity-list">{rows.length ? rows.map((item, index) => { const logout = String(item.action || "").toUpperCase() === "LOGOUT"; return <div key={`${item.id}-${index}`}><span className={`activity-dot ${logout ? "logout" : "login"}`}>{logout ? <LogOut size={13} /> : <LogIn size={13} />}</span><div><strong>{item.full_name || item.username || "Tài khoản"}</strong><p>{activityAction(item.action)} · {roleText(item.role || "")}{item.ip_address ? ` · ${item.ip_address}` : ""}</p></div><time>{item.created_at ? new Date(item.created_at).toLocaleString("vi-VN") : "—"}</time></div>; }) : <div className="activity-empty">Chưa có lịch sử đăng nhập / đăng xuất</div>}</div>;
}
